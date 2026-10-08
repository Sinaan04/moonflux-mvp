/**
 * E2E Test Step 2: BUY tokens on the bonding curve
 * Uses the mint created in Step 1.
 */

const { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, getAccount } = require("@solana/spl-token");
const { Program, AnchorProvider } = require("@coral-xyz/anchor");
const { createHash } = require("crypto");
const fs = require("fs");

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("DrVK92avUZvKHbyxd3StwX9c3zkZf5nDNoBrgU32e1NE");
const WALLET_PATH = process.env.WALLET_PATH || (process.env.HOME || process.env.USERPROFILE) + "/.config/solana/id.json";
const FEE_RECIPIENT = new PublicKey("8ey9ax7pvrp2QM7UCs3YQ2QwkS4H3wgU7LWbRE3teFk7");

// Amount to buy
const BUY_SOL = 0.1; // 0.1 SOL

function patchIdlTypes(idl) {
  let json = JSON.stringify(idl);
  json = json.replaceAll('"publicKey"', '"pubkey"');
  json = json.replaceAll('"isMut"', '"writable"');
  json = json.replaceAll('"isSigner"', '"signer"');
  const patched = JSON.parse(json);
  
  if (patched.accounts && patched.types) {
    for (const acc of patched.accounts) {
      if (acc.type && acc.type.kind === "struct") {
        if (!patched.types.find(t => t.name === acc.name)) {
          patched.types.push({ name: acc.name, type: acc.type });
        }
      }
      if (!acc.discriminator) {
        acc.discriminator = Array.from(createHash("sha256").update(`account:${acc.name}`).digest().slice(0, 8));
      }
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
  console.log("  MOONFLUXX E2E TEST — STEP 2: BUY TOKENS");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Load step 1 result
  const step1 = JSON.parse(fs.readFileSync("scripts/e2e-step1-result.json", "utf8"));
  const mintPubkey = new PublicKey(step1.mintAddress);
  const curvePda = new PublicKey(step1.curvePda);
  const solVaultPda = new PublicKey(step1.solVaultPda);
  const curveTokenAccount = new PublicKey(step1.curveTokenAccount);

  console.log("Token Mint:", step1.mintAddress);
  console.log("Buy Amount:", BUY_SOL, "SOL\n");

  // Load wallet
  const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  const buyer = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log("Buyer wallet:", buyer.publicKey.toBase58());

  const connection = new Connection(RPC, "confirmed");
  const balance = await connection.getBalance(buyer.publicKey);
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL\n");

  // Setup Anchor
  const walletAdapter = {
    publicKey: buyer.publicKey,
    signTransaction: async (tx) => { tx.partialSign(buyer); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.partialSign(buyer)); return txs; },
  };
  const provider = new AnchorProvider(connection, walletAdapter, { commitment: "confirmed" });
  const rawIdl = JSON.parse(fs.readFileSync("lib/idl.json", "utf8"));
  const idl = patchIdlTypes(rawIdl);
  const program = new Program(idl, provider);

  const globalPda = PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID)[0];

  // Buyer's ATA for this token
  const buyerTokenAccount = getAssociatedTokenAddressSync(mintPubkey, buyer.publicKey);

  // Check if buyer ATA exists, if not create it
  const tx = new Transaction();
  let ataExists = false;
  try {
    await getAccount(connection, buyerTokenAccount);
    ataExists = true;
    console.log("Buyer ATA exists:", buyerTokenAccount.toBase58());
  } catch {
    console.log("Creating buyer ATA:", buyerTokenAccount.toBase58());
    tx.add(createAssociatedTokenAccountInstruction(
      buyer.publicKey, buyerTokenAccount, buyer.publicKey, mintPubkey
    ));
  }

  // Build buy instruction
  const BN = require("bn.js");
  const amountInLamports = new BN(BUY_SOL * LAMPORTS_PER_SOL);
  const minTokensOut = new BN(0); // Accept any amount for test

  console.log("\nBuilding buy instruction...");
  console.log("  amountIn:", amountInLamports.toString(), "lamports");
  console.log("  minTokensOut:", minTokensOut.toString());

  const buyIx = await program.methods
    .buy(amountInLamports, minTokensOut)
    .accountsStrict({
      bondingCurve: curvePda,
      solVault: solVaultPda,
      curveTokenAccount: curveTokenAccount,
      userTokenAccount: buyerTokenAccount,
      mint: mintPubkey,
      user: buyer.publicKey,
      globalConfig: globalPda,
      feeRecipient: FEE_RECIPIENT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  tx.add(buyIx);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = buyer.publicKey;
  tx.sign(buyer);

  console.log("\nSending transaction...\n");
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

  // Read buyer token balance
  const tokenAccInfo = await getAccount(connection, buyerTokenAccount);
  const tokenBalance = Number(tokenAccInfo.amount) / 1e6; // 6 decimals

  // Read curve state
  const curveInfo = await connection.getAccountInfo(curvePda);
  const realSolReserves = Number(curveInfo.data.readBigUInt64LE(8 + 32 + 32 + 8 + 8)) / LAMPORTS_PER_SOL;

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ✅ STEP 2 COMPLETE — TOKENS PURCHASED!");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("SOL Spent:       ", BUY_SOL, "SOL");
  console.log("Tokens Received: ", tokenBalance.toLocaleString(), "tokens");
  console.log("Curve SOL Raised:", realSolReserves.toFixed(4), "SOL");
  console.log("Buyer ATA:       ", buyerTokenAccount.toBase58());
  console.log("");
  console.log("━━━ EXPLORER LINKS ━━━");
  console.log(`TX:     https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  console.log(`BUYER:  https://explorer.solana.com/address/${buyerTokenAccount.toBase58()}?cluster=devnet`);
  console.log(`VAULT:  https://explorer.solana.com/address/${solVaultPda.toBase58()}?cluster=devnet\n`);

  const result = {
    step: 2, name: "Buy Tokens",
    mintAddress: step1.mintAddress,
    buyer: buyer.publicKey.toBase58(),
    buyerTokenAccount: buyerTokenAccount.toBase58(),
    solSpent: BUY_SOL,
    tokensReceived: tokenBalance,
    curveSOLRaised: realSolReserves,
    signature,
    explorerTx: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync("scripts/e2e-step2-result.json", JSON.stringify(result, null, 2));
  console.log("✅ Results saved → scripts/e2e-step2-result.json");
}

main().catch((err) => {
  console.error("❌ ERROR:", err.message || err);
  if (err.logs) {
    console.error("\nProgram Logs:");
    err.logs.forEach(l => console.error("  ", l));
  }
  process.exit(1);
});
