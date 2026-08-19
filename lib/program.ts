import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import BN from 'bn.js'; // FIX #9: Static top-level import — no dynamic import on every trade
import idl from './idl.json';

// ── Program constants ─────────────────────────────────────────────────────────
// Replace this with the real deployed program ID after `anchor deploy`
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'DrVK92avUZvKHbyxd3StwX9c3zkZf5nDNoBrgU32e1NE'
);

// IMPORTANT: Replace this with your actual treasury wallet public key before mainnet
export const FEE_RECIPIENT = new PublicKey(
  process.env.NEXT_PUBLIC_FEE_RECIPIENT ?? '8ey9ax7pvrp2QM7UCs3YQ2QwkS4H3wgU7LWbRE3teFk7'
);

// ── Program factory ───────────────────────────────────────────────────────────
export function getMoonfluxProgram(connection: Connection, wallet: any): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  // Address is read from idl.address — Anchor 0.30 only accepts (idl, provider)
  return new Program(idl as unknown as Idl, provider);
}

// ── PDA derivations ───────────────────────────────────────────────────────────

export function getBondingCurvePDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('curve'), mint.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function getSolVaultPDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('sol_vault'), mint.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function getGlobalConfigPDA(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    PROGRAM_ID
  )[0];
}

/**
 * Derives the migration wallet PDA for a given token mint.
 * This is where SOL + tokens are sent when `migrate` is called.
 * 
 * NOTE: If this seed doesn't match the on-chain program, the migrate
 * transaction will fail with an "account address mismatch" error.
 * In that case, try alternative seeds: ['migration'], ['migrate', mint], etc.
 */
export function getMigrationWalletPDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('migration'), mint.toBuffer()],
    PROGRAM_ID
  )[0];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Graduation threshold in SOL — when realSolReserves reaches this, curve is complete */
export const GRADUATION_CAP_SOL = 85;
export const GRADUATION_CAP_LAMPORTS = GRADUATION_CAP_SOL * 1_000_000_000;

// ── Math helpers (mirrors the on-chain constant product math) ─────────────────

const LAMPORTS = 1_000_000_000; // 1 SOL in lamports
const TOKEN_DECIMALS = 1_000_000; // 6 decimal places

/**
 * Simulate a buy: given SOL in (in lamports), return expected tokens out.
 * Mirrors the on-chain buy() logic including the 1% fee.
 * Use this to show the user a preview before submitting the transaction.
 */
export function simulateBuy(
  virtualSol: BN,
  virtualToken: BN,
  solIn: BN,
  feeBps: number
): { tokensOut: BN; fee: BN; priceImpact: number } {
  const fee = solIn.mul(new BN(feeBps)).div(new BN(10_000));
  const netSol = solIn.sub(fee);

  const k = virtualSol.mul(virtualToken);
  const newVirtualSol = virtualSol.add(netSol);
  const newVirtualToken = k.div(newVirtualSol).add(new BN(1)); // +1 for rounding (FIX #5)
  const tokensOut = virtualToken.sub(newVirtualToken);

  // Price impact = how much the price moved as a percentage
  const priceBefore = virtualSol.toNumber() / virtualToken.toNumber();
  const priceAfter = newVirtualSol.toNumber() / newVirtualToken.toNumber();
  const priceImpact = ((priceAfter - priceBefore) / priceBefore) * 100;

  return { tokensOut, fee, priceImpact };
}

/**
 * Simulate a sell: given tokens in, return expected SOL out.
 * Mirrors the on-chain sell() logic including the 1% fee.
 */
export function simulateSell(
  virtualSol: BN,
  virtualToken: BN,
  tokensIn: BN,
  feeBps: number
): { solOut: BN; fee: BN; priceImpact: number } {
  const k = virtualSol.mul(virtualToken);
  const newVirtualToken = virtualToken.add(tokensIn);
  const newVirtualSol = k.div(newVirtualToken);
  const solOut = virtualSol.sub(newVirtualSol);

  const fee = solOut.mul(new BN(feeBps)).div(new BN(10_000));
  const netSol = solOut.sub(fee);

  const priceBefore = virtualSol.toNumber() / virtualToken.toNumber();
  const priceAfter = newVirtualSol.toNumber() / newVirtualToken.toNumber();
  const priceImpact = Math.abs((priceAfter - priceBefore) / priceBefore) * 100;

  return { solOut: netSol, fee, priceImpact };
}

/**
 * Fetches the on-chain state of a bonding curve account.
 * Returns null if the account doesn't exist yet.
 */
export async function fetchBondingCurve(
  connection: Connection,
  wallet: any,
  mint: PublicKey
): Promise<{
  virtualSolReserves: BN;
  virtualTokenReserves: BN;
  realSolReserves: BN;
  realTokenReserves: BN;
  complete: boolean;
  totalFeesCollected: BN;
  createdAt: number;
} | null> {
  try {
    const program = getMoonfluxProgram(connection, wallet);
    const curvePda = getBondingCurvePDA(mint);
    const curve = await (program.account as any).bondingCurve.fetch(curvePda);
    return curve;
  } catch {
    return null;
  }
}

// Re-export BN for convenience so callers don't need to import it separately
export { BN };
