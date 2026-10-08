/**
 * E2E Test Step 5: MIGRATE — Move SOL + tokens to migration wallet
 * Calls the `migrate` instruction as admin after graduation.
 */

const { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, getAccount } = require("@solana/spl-token");
const { Program, AnchorProvider } = require("@coral-xyz/anchor");
const { createHash } = require("crypto");
const BN = require("bn.js");
const fs = require("fs");

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("DrVK92avUZvKHbyxd3StwX9c3zkZf5nDNoBrgU32e1NE");
const WALLET_PATH = process.env.WALLET_PATH || (process.env.HOME || process.env.USERPROFILE) + "/.config/solana/id.json";

function patchIdl(idl) {
  let j = JSON.stringify(idl);
  j = j.replaceAll('"publicKey"', '"pubkey"').replaceAll('"isMut"', '"writable"').replaceAll('"isSigner"', '"signer"');
  const p = JSON.parse(j);
  for (const a of p.accounts) {
    if (a.type && a.type.kind === "struct" && !p.types.find(t => t.name === a.name)) p.types.push({ name: a.name, type: a.type });
    if (!a.discriminator) a.discriminator = Array.from(createHash("sha256").update("account:" + a.name).digest().slice(0, 8));
  }
  for (const ix of p.instructions) {
    if (!ix.discriminator) {
      const sn = ix.name.replace(/[A-Z]/g, (c, i) => i === 0 ? c.toLowerCase() : "_" + c.toLowerCase());
      ix.discriminator = Array.from(createHash("sha256").update("global:" + sn).digest().slice(0, 8));
    }
  }
  return p;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  MOONFLUXX E2E TEST — STEP 5: MIGRATION");
  console.log("═══════════════════════════════════════════════════════════\n");

  const step1 = JSON.parse(fs.readFileSync("scripts/e2e-step1-result.json"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH))));
  const conn = new Connection(RPC, "confirmed");
  const globalPda = PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID)[0];
  const mintPubkey = new PublicKey(step1.mintAddress);
  const curvePda = new PublicKey(step1.curvePda);
  const solVaultPda = new PublicKey(step1.solVaultPda);
  const curveTokenAccount = new PublicKey(step1.curveTokenAccount);

  // Verify curve is graduated
  const ci = await conn.getAccountInfo(curvePda);
  const complete = ci.data[104] === 1;
  console.log("Curve complete:", complete);
  if (!complete) {
    console.error("❌ Curve is not graduated. Run step 4 first.");
    process.exit(1);
  }

  // Check vault balances before migration
  const vaultSolBefore = await conn.getBalance(solVaultPda);
  let vaultTokensBefore = 0;
  try {
    const cta = await getAccount(conn, curveTokenAccount);
    vaultTokensBefore = Number(cta.amount);
  } catch {}
  console.log("Vault SOL:   ", vaultSolBefore / LAMPORTS_PER_SOL);
  console.log("Vault Tokens:", vaultTokensBefore / 1e6);

  // The Migrate struct from Rust (line 652-698):
  //   bonding_curve, sol_vault, curve_token_account, mint,
  //   migration_wallet (CHECK: any admin-controlled destination),
  //   migration_token_account (token::mint=mint, token::authority=migration_wallet),
  //   global_config, admin (signer), token_program, system_program
  //
  // migration_wallet is NOT a PDA — it's just any wallet the admin specifies
  // We'll use the admin wallet itself as the migration destination

  const migrationWallet = admin.publicKey; // admin receives the migrated funds
  const migrationTokenAccount = getAssociatedTokenAddressSync(mintPubkey, migrationWallet);

  console.log("\nMigration wallet:", migrationWallet.toBase58());
  console.log("Migration ATA:  ", migrationTokenAccount.toBase58());

  // Setup Anchor
  const wa = { publicKey: admin.publicKey, signTransaction: async t => { t.partialSign(admin); return t; }, signAllTransactions: async t => { t.forEach(x => x.partialSign(admin)); return t; } };
  const provider = new AnchorProvider(conn, wa, { commitment: "confirmed" });
  const program = new Program(patchIdl(JSON.parse(fs.readFileSync("lib/idl.json", "utf8"))), provider);

  // Ensure migration token account exists
  const tx = new Transaction();
  try {
    await getAccount(conn, migrationTokenAccount);
    console.log("Migration ATA already exists ✅");
  } catch {
    console.log("Creating migration ATA...");
    tx.add(createAssociatedTokenAccountInstruction(
      admin.publicKey, migrationTokenAccount, migrationWallet, mintPubkey
    ));
  }

  // Build migrate instruction
  console.log("\nBuilding migrate instruction...");
  const migrateIx = await program.methods.migrate()
    .accountsStrict({
      bondingCurve: curvePda,
      solVault: solVaultPda,
      curveTokenAccount: curveTokenAccount,
      mint: mintPubkey,
      migrationWallet: migrationWallet,
      migrationTokenAccount: migrationTokenAccount,
      globalConfig: globalPda,
      admin: admin.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  tx.add(migrateIx);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);

  console.log("Sending migration transaction...\n");
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  console.log("Signature:", sig);
  console.log("Confirming...\n");

  const confirmation = await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight }, "confirmed"
  );

  if (confirmation.value.err) {
    console.error("❌ FAILED:", JSON.stringify(confirmation.value.err));
    process.exit(1);
  }

  // Check post-migration balances
  const vaultSolAfter = await conn.getBalance(solVaultPda);
  const adminSolAfter = await conn.getBalance(admin.publicKey);
  let migratedTokens = 0;
  try {
    const mta = await getAccount(conn, migrationTokenAccount);
    migratedTokens = Number(mta.amount);
  } catch {}

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ✅ STEP 5 COMPLETE — MIGRATION SUCCESSFUL!");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("SOL Migrated:    ", (vaultSolBefore - vaultSolAfter) / LAMPORTS_PER_SOL, "SOL");
  console.log("Tokens Migrated: ", migratedTokens / 1e6);
  console.log("Vault SOL After: ", vaultSolAfter / LAMPORTS_PER_SOL, "(should be 0)");
  console.log("Admin SOL Now:   ", adminSolAfter / LAMPORTS_PER_SOL);
  console.log("");
  console.log("━━━ EXPLORER LINKS ━━━");
  console.log(`TX:       https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  console.log(`VAULT:    https://explorer.solana.com/address/${solVaultPda.toBase58()}?cluster=devnet`);
  console.log(`MIGRATED: https://explorer.solana.com/address/${migrationTokenAccount.toBase58()}?cluster=devnet\n`);

  const result = {
    step: 5, name: "Migration",
    mintAddress: step1.mintAddress,
    migrationWallet: migrationWallet.toBase58(),
    solMigrated: (vaultSolBefore - vaultSolAfter) / LAMPORTS_PER_SOL,
    tokensMigrated: migratedTokens / 1e6,
    signature: sig,
    explorerTx: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync("scripts/e2e-step5-result.json", JSON.stringify(result, null, 2));
  console.log("✅ Results saved → scripts/e2e-step5-result.json");
}

main().catch(e => {
  console.error("❌ ERROR:", e.message);
  if (e.logs) {
    console.error("\nProgram Logs:");
    e.logs.forEach(l => console.log(" ", l));
  }
});
