import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { Program, AnchorProvider, Idl, Wallet } from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  getBondingCurvePDA,
  getSolVaultPDA,
  getGlobalConfigPDA,
  getMigrationWalletPDA,
} from "@/lib/program";
import idl from "@/lib/idl.json";
import { createServiceClient } from "@/lib/supabase";

/**
 * POST /api/cron/migrate
 * 
 * Automated migration cron — runs every 5 minutes via Vercel Cron or manual trigger.
 * 
 * Flow:
 * 1. Query Supabase for tokens where graduated = false
 * 2. For each, fetch on-chain BondingCurve account to check complete == true
 * 3. Call the Anchor `migrate` instruction using admin keypair
 * 4. Update Supabase: tokens.graduated = true
 * 
 * Security:
 * - Protected by CRON_SECRET header check
 * - Admin keypair loaded from server-only env var (never exposed to client)
 * 
 * NOTE: Raydium pool creation will be added as a second step after migration is verified working.
 */
export async function POST(req: NextRequest) {
  // ── Auth Check ──
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Load Admin Keypair ──
  const adminKeypairEnv = process.env.ADMIN_KEYPAIR;
  if (!adminKeypairEnv) {
    return NextResponse.json(
      { error: "ADMIN_KEYPAIR not configured. Set it in .env.local as a JSON byte array." },
      { status: 500 }
    );
  }

  let adminKeypair: Keypair;
  try {
    const secretKey = JSON.parse(adminKeypairEnv);
    adminKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid ADMIN_KEYPAIR format. Must be a JSON array of bytes, e.g. [12,34,56,...]" },
      { status: 500 }
    );
  }

  // ── Setup Connection ──
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  const supabase = createServiceClient();

  // ── Query Un-Graduated Tokens ──
  const { data: tokens, error: dbError } = await supabase
    .from("tokens")
    .select("id, mint_address, name, ticker, graduated")
    .eq("graduated" as any, false) as { data: { id: string; mint_address: string; name: string; ticker: string; graduated: boolean }[] | null; error: any };

  if (dbError) {
    return NextResponse.json({ error: "DB query failed", details: dbError.message }, { status: 500 });
  }

  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ message: "No un-graduated tokens found", migratedCount: 0 });
  }

  const results: { mint: string; ticker: string; status: string; error?: string }[] = [];

  for (const token of tokens) {
    const mintStr = token.mint_address;
    if (!mintStr) {
      results.push({ mint: "unknown", ticker: token.ticker, status: "SKIPPED", error: "No mint address" });
      continue;
    }

    try {
      const mint = new PublicKey(mintStr);
      const bondingCurvePDA = getBondingCurvePDA(mint);

      // ── Fetch on-chain curve state ──
      const curveAccountInfo = await connection.getAccountInfo(bondingCurvePDA);
      if (!curveAccountInfo) {
        results.push({ mint: mintStr, ticker: token.ticker, status: "SKIPPED", error: "Curve account not found on-chain" });
        continue;
      }

      // Parse the 'complete' field from the BondingCurve account
      // Layout: 8 (discriminator) + 32 (mint) + 32 (creator) + 8 (vSol) + 8 (vToken) + 8 (rSol) + 8 (rToken) + 1 (complete)
      const completeByteOffset = 8 + 32 + 32 + 8 + 8 + 8 + 8; // = 104
      const isComplete = curveAccountInfo.data[completeByteOffset] === 1;

      if (!isComplete) {
        // Curve hasn't reached 85 SOL yet — skip
        const realSolReserves = Number(curveAccountInfo.data.readBigUInt64LE(8 + 32 + 32 + 8 + 8)) / 1e9;
        results.push({
          mint: mintStr,
          ticker: token.ticker,
          status: "NOT_COMPLETE",
          error: `realSolReserves: ${realSolReserves.toFixed(2)} SOL (need 85 SOL)`,
        });
        continue;
      }

      // ── Curve is complete — Execute Migration ──
      console.log(`[MIGRATE] ${token.ticker} (${mintStr}) — Curve complete! Executing migration...`);

      const solVault = getSolVaultPDA(mint);
      const globalConfig = getGlobalConfigPDA();
      const migrationWallet = getMigrationWalletPDA(mint);
      const curveTokenAccount = await getAssociatedTokenAddress(mint, bondingCurvePDA, true);
      const migrationTokenAccount = await getAssociatedTokenAddress(mint, migrationWallet, true);

      // Build a wallet adapter for Anchor from the admin keypair
      const adminWallet = {
        publicKey: adminKeypair.publicKey,
        signTransaction: async (tx: Transaction) => {
          tx.partialSign(adminKeypair);
          return tx;
        },
        signAllTransactions: async (txs: Transaction[]) => {
          txs.forEach(tx => tx.partialSign(adminKeypair));
          return txs;
        },
      };

      const provider = new AnchorProvider(connection, adminWallet as any, {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });
      const program = new Program(idl as unknown as Idl, provider);

      // Build the migrate instruction
      const migrateTx = await (program.methods as any)
        .migrate()
        .accounts({
          bondingCurve: bondingCurvePDA,
          solVault,
          curveTokenAccount,
          mint,
          migrationWallet,
          migrationTokenAccount,
          globalConfig,
          admin: adminKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      // Check if migrationTokenAccount ATA exists, create if not
      const migrationAtaInfo = await connection.getAccountInfo(migrationTokenAccount);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      const combinedTx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: adminKeypair.publicKey,
      });

      if (!migrationAtaInfo) {
        combinedTx.add(
          createAssociatedTokenAccountInstruction(
            adminKeypair.publicKey,
            migrationTokenAccount,
            migrationWallet,
            mint
          )
        );
      }

      combinedTx.add(...migrateTx.instructions);
      combinedTx.sign(adminKeypair);

      const signature = await connection.sendRawTransaction(combinedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      console.log(`[MIGRATE] ${token.ticker} — Migration tx confirmed: ${signature}`);

      // ── Update database ──
      await (supabase
        .from("tokens") as any)
        .update({ graduated: true, bonding_curve_progress: 1.0 })
        .eq("id", token.id);

      results.push({ mint: mintStr, ticker: token.ticker, status: "MIGRATED" });

      // TODO Phase 2: Create Raydium CPMM pool with migrated funds + burn LP tokens
      // This will be added once migration is verified working on devnet.

    } catch (err: any) {
      console.error(`[MIGRATE] ${token.ticker} failed:`, err);
      results.push({
        mint: mintStr,
        ticker: token.ticker,
        status: "FAILED",
        error: err.message?.slice(0, 200) || "Unknown error",
      });
    }
  }

  const migratedCount = results.filter(r => r.status === "MIGRATED").length;
  console.log(`[MIGRATE] Cron complete. ${migratedCount}/${tokens.length} migrated.`);

  return NextResponse.json({
    message: `Migration cron complete. ${migratedCount} token(s) migrated.`,
    migratedCount,
    total: tokens.length,
    results,
  });
}

// Also support GET for Vercel Cron (which sends GET requests)
export async function GET(req: NextRequest) {
  // Vercel Cron sends the secret in the Authorization header
  return POST(req);
}
