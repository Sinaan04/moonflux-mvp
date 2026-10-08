/**
 * E2E Test Step 3: SELL tokens back to the bonding curve
 * Sells half of the tokens received in Step 2.
 */

const { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } = require("@solana/spl-token");
const { Program, AnchorProvider } = require("@coral-xyz/anchor");
const { createHash } = require("crypto");
const BN = require("bn.js");
const fs = require("fs");

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("DrVK92avUZvKHbyxd3StwX9c3zkZf5nDNoBrgU32e1NE");
const WALLET_PATH = process.env.WALLET_PATH || (process.env.HOME || process.env.USERPROFILE) + "/.config/solana/id.json";
const FEE_RECIPIENT = new PublicKey("8ey9ax7pvrp2QM7UCs3YQ2QwkS4H3wgU7LWbRE3teFk7");

function patchIdlTypes(idl) {
  let json = JSON.stringify(idl);
  json = json.replaceAll('"publicKey"', '"pubkey"');
  json = json.replaceAll('"isMut"', '"writable"');
  json = json.replaceAll('"isSigner"', '"signer"');
  const patched = JSON.parse(json);
  if (patched.accounts && patched.types) {
    for (const acc of patched.accounts) {
      if (acc.type && acc.type.kind === "struct" && !patched.types.find(t => t.name === acc.name))
        patched.types.push({ name: acc.name, type: acc.type });
      if (!acc.discriminator)
        acc.discriminator = Array.from(createHash("sha256").update(`account:${acc.name}`).digest().slice(0, 8));
    }
  }
  if (patched.instructions) {
    for (const ix of patched.instructions) {
      if (!ix.discriminator) {
        const sn = ix.name.replace(/[A-Z]/g, (c, i) => i === 0 ? c.toLowerCase() : '_' + c.toLowerCase());
        ix.discriminator = Array.from(createHash("sha256").update(`global:${sn}`).digest().slice(0, 8));
      }
    }
  }
  return patched;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  MOONFLUXX E2E TEST — STEP 3: SELL TOKENS");
  console.log("═══════════════════════════════════════════════════════════\n");

  const step1 = JSON.parse(fs.readFileSync("scripts/e2e-step1-result.json", "utf8"));
  const mintPubkey = new PublicKey(step1.mintAddress);
  const curvePda = new PublicKey(step1.curvePda);
  const solVaultPda = new PublicKey(step1.solVaultPda);
  const curveTokenAccount = new PublicKey(step1.curveTokenAccount);
  const globalPda = PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID)[0];

  const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  const seller = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const connection = new Connection(RPC, "confirmed");

  const sellerTokenAccount = getAssociatedTokenAddressSync(mintPubkey, seller.publicKey);

  // Check current token balance
  const tokenAccInfo = await getAccount(connection, sellerTokenAccount);
  const currentBalance = Number(tokenAccInfo.amount);
  const sellAmount = Math.floor(currentBalance / 2); // sell half

  console.log("Token Mint:      ", step1.mintAddress);
  console.log("Seller wallet:   ", seller.publicKey.toBase58());
  console.log("Current tokens:  ", (currentBalance / 1e6).toLocaleString());
  console.log("Selling:         ", (sellAmount / 1e6).toLocaleString(), "tokens (50%)");

  const solBefore = await connection.getBalance(seller.publicKey);
  console.log("SOL before sell: ", solBefore / LAMPORTS_PER_SOL, "SOL\n");

  // Setup Anchor
  const walletAdapter = {
    publicKey: seller.publicKey,
    signTransaction: async (tx) => { tx.partialSign(seller); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.partialSign(seller)); return txs; },
  };
  const provider = new AnchorProvider(connection, walletAdapter, { commitment: "confirmed" });
  const idl = patchIdlTypes(JSON.parse(fs.readFileSync("lib/idl.json", "utf8")));
  const program = new Program(idl, provider);

  console.log("Building sell instruction...");
  const sellIx = await program.methods
    .sell(new BN(sellAmount), new BN(0)) // minSolOut = 0 for test
    .accountsStrict({
      bondingCurve: curvePda,
      solVault: solVaultPda,
      curveTokenAccount: curveTokenAccount,
      userTokenAccount: sellerTokenAccount,
      mint: mintPubkey,
      user: seller.publicKey,
      globalConfig: globalPda,
      feeRecipient: FEE_RECIPIENT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(sellIx);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = seller.publicKey;
  tx.sign(seller);

  console.log("Sending transaction...\n");
  const signature = await connection.sendRawTransaction(tx.serialize(), {
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

  // Read final balances
  const tokenAfter = await getAccount(connection, sellerTokenAccount);
  const solAfter = await connection.getBalance(seller.publicKey);
  const solReceived = (solAfter - solBefore) / LAMPORTS_PER_SOL;

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ✅ STEP 3 COMPLETE — TOKENS SOLD!");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("Tokens Sold:      ", (sellAmount / 1e6).toLocaleString());
  console.log("Tokens Remaining: ", (Number(tokenAfter.amount) / 1e6).toLocaleString());
  console.log("SOL Received:     ", solReceived.toFixed(6), "SOL (net of fees + tx cost)");
  console.log("SOL Balance Now:  ", solAfter / LAMPORTS_PER_SOL, "SOL");
  console.log("");
  console.log("━━━ EXPLORER LINKS ━━━");
  console.log(`TX:     https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  console.log(`SELLER: https://explorer.solana.com/address/${sellerTokenAccount.toBase58()}?cluster=devnet\n`);

  const result = {
    step: 3, name: "Sell Tokens",
    mintAddress: step1.mintAddress,
    seller: seller.publicKey.toBase58(),
    tokensSold: sellAmount / 1e6,
    tokensRemaining: Number(tokenAfter.amount) / 1e6,
    solReceived,
    signature,
    explorerTx: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync("scripts/e2e-step3-result.json", JSON.stringify(result, null, 2));
  console.log("✅ Results saved → scripts/e2e-step3-result.json");
}

main().catch((err) => {
  console.error("❌ ERROR:", err.message || err);
  if (err.logs) {
    console.error("\nProgram Logs:");
    err.logs.forEach(l => console.error("  ", l));
  }
  process.exit(1);
});
