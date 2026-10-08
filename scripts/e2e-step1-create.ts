/**
 * E2E Test Step 1: Create a new token on MoonFluxx (Devnet)
 * Uses ts-node with the same Anchor Program pattern as the real app.
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createInitializeMint2Instruction, MintLayout } from "@solana/spl-token";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import * as fs from "fs";
import idl from "../lib/idl.json";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("DrVK92avUZvKHbyxd3StwX9c3zkZf5nDNoBrgU32e1NE");
const WALLET_PATH = process.env.WALLET_PATH || (process.env.HOME || process.env.USERPROFILE) + "/.config/solana/id.json";

function getBondingCurvePDA(mint: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("curve"), mint.toBuffer()], PROGRAM_ID)[0];
}
function getSolVaultPDA(mint: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("sol_vault"), mint.toBuffer()], PROGRAM_ID)[0];
}
function getGlobalConfigPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID)[0];
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  MOONFLUXX E2E TEST — STEP 1: TOKEN CREATION");
  console.log("═══════════════════════════════════════════════════════════\n");

  const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  const creator = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log("Creator wallet:", creator.publicKey.toBase58());

  const connection = new Connection(RPC, "confirmed");
  const balance = await connection.getBalance(creator.publicKey);
  console.log("Balance:", balance / 1e9, "SOL\n");

  const mint = Keypair.generate();
  const curvePda = getBondingCurvePDA(mint.publicKey);
  const solVaultPda = getSolVaultPDA(mint.publicKey);
  const globalPda = getGlobalConfigPDA();
  const curveTokenAccount = getAssociatedTokenAddressSync(mint.publicKey, curvePda, true);

  console.log("━━━ Token Details ━━━");
  console.log("Mint:", mint.publicKey.toBase58());
  console.log("Curve PDA:", curvePda.toBase58());
  console.log("SOL Vault:", solVaultPda.toBase58());
  console.log("Curve ATA:", curveTokenAccount.toBase58());
  console.log("");

  const walletAdapter = {
    publicKey: creator.publicKey,
    signTransaction: async (tx: any) => { tx.partialSign(creator); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(creator)); return txs; },
  };

  const provider = new AnchorProvider(connection, walletAdapter as any, { commitment: "confirmed" });
  const program = new Program(idl as unknown as Idl, provider);

  const metadataUri = "https://moonflux.vercel.app/api/meta/ETEST";

  // 1. Create mint account
  const lamportsForMint = await connection.getMinimumBalanceForRentExemption(MintLayout.span);
  const createMintIx = SystemProgram.createAccount({
    fromPubkey: creator.publicKey,
    newAccountPubkey: mint.publicKey,
    space: MintLayout.span,
    lamports: lamportsForMint,
    programId: TOKEN_PROGRAM_ID,
  });

  // 2. Initialize mint: authority = curvePDA, freeze = null
  const initMintIx = createInitializeMint2Instruction(
    mint.publicKey, 6, curvePda, null, TOKEN_PROGRAM_ID
  );

  // 3. Build createPool via Anchor (same as useTokenDeploy.ts)
  console.log("Building createPool...");
  const createPoolTx = await (program.methods as any).createPool(metadataUri, 0)
    .accounts({
      bondingCurve: curvePda,
      solVault: solVaultPda,
      curveTokenAccount,
      mint: mint.publicKey,
      creator: creator.publicKey,
      quoteMint: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      globalConfig: globalPda,
    })
    .transaction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const combinedTx = new Transaction({ recentBlockhash: blockhash, feePayer: creator.publicKey })
    .add(createMintIx)
    .add(initMintIx)
    .add(...createPoolTx.instructions);

  combinedTx.partialSign(mint);
  combinedTx.partialSign(creator);

  console.log("Sending transaction...\n");
  const signature = await connection.sendRawTransaction(combinedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  console.log("Signature:", signature);
  console.log("Confirming...\n");

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight }, "confirmed"
  );

  if (confirmation.value.err) {
    console.error("❌ FAILED:", JSON.stringify(confirmation.value.err));
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ✅ STEP 1 COMPLETE — TOKEN CREATED!");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("Mint:           ", mint.publicKey.toBase58());
  console.log("Creator:        ", creator.publicKey.toBase58());
  console.log("Mint Authority:  Bonding Curve PDA");
  console.log("Freeze Authority: null (disabled)\n");
  console.log("━━━ EXPLORER LINKS ━━━");
  console.log(`TX:     https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  console.log(`MINT:   https://explorer.solana.com/address/${mint.publicKey.toBase58()}?cluster=devnet`);
  console.log(`CURVE:  https://explorer.solana.com/address/${curvePda.toBase58()}?cluster=devnet`);
  console.log(`VAULT:  https://explorer.solana.com/address/${solVaultPda.toBase58()}?cluster=devnet\n`);

  const result = {
    step: 1, name: "Token Creation",
    mintAddress: mint.publicKey.toBase58(),
    mintSecretKey: Array.from(mint.secretKey),
    creator: creator.publicKey.toBase58(),
    signature,
    curvePda: curvePda.toBase58(),
    solVaultPda: solVaultPda.toBase58(),
    curveTokenAccount: curveTokenAccount.toBase58(),
    explorerTx: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync("scripts/e2e-step1-result.json", JSON.stringify(result, null, 2));
  console.log("✅ Results saved → scripts/e2e-step1-result.json");
}

main().catch((err) => {
  console.error("❌ ERROR:", err.message || err);
  if (err.logs) {
    console.error("\nProgram Logs:");
    err.logs.forEach((l: string) => console.error("  ", l));
  }
  process.exit(1);
});
