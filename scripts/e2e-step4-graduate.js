// Graduation: set target to current reserves + 0.001 SOL, buy to trigger, restore
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require("@solana/spl-token");
const { Program, AnchorProvider } = require("@coral-xyz/anchor");
const { createHash } = require("crypto");
const BN = require("bn.js");
const fs = require("fs");

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("DrVK92avUZvKHbyxd3StwX9c3zkZf5nDNoBrgU32e1NE");
const FEE_RECIPIENT = new PublicKey("8ey9ax7pvrp2QM7UCs3YQ2QwkS4H3wgU7LWbRE3teFk7");

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
  const step1 = JSON.parse(fs.readFileSync("scripts/e2e-step1-result.json"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync((process.env.WALLET_PATH || (process.env.HOME || process.env.USERPROFILE) + "/.config/solana/id.json")))));
  const conn = new Connection(RPC, "confirmed");
  const globalPda = PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID)[0];
  const mintPubkey = new PublicKey(step1.mintAddress);
  const curvePda = new PublicKey(step1.curvePda);
  const buyerAta = getAssociatedTokenAddressSync(mintPubkey, admin.publicKey);

  const wa = { publicKey: admin.publicKey, signTransaction: async t => { t.partialSign(admin); return t; }, signAllTransactions: async t => { t.forEach(x => x.partialSign(admin)); return t; } };
  const provider = new AnchorProvider(conn, wa, { commitment: "confirmed" });
  const program = new Program(patchIdl(JSON.parse(fs.readFileSync("lib/idl.json", "utf8"))), provider);

  // Read current curve real_sol_reserves
  let ci = await conn.getAccountInfo(curvePda);
  let realSol = Number(ci.data.readBigUInt64LE(88));
  let complete = ci.data[104] === 1;
  console.log("Curve SOL:", realSol / LAMPORTS_PER_SOL, "| Complete:", complete);

  if (complete) { console.log("Already graduated!"); return; }

  // Read GlobalConfig
  const gi = await conn.getAccountInfo(globalPda);
  const feeBps = gi.data.readUInt16LE(72);
  const usdcMint = new PublicKey(gi.data.slice(91, 123));
  const usdtMint = new PublicKey(gi.data.slice(123, 155));

  // The buy function deducts a 0.25% fee BEFORE adding to reserves.
  // So if we buy X lamports, only X * 0.9975 goes to real_sol_reserves.
  // To trigger graduation: real_sol_reserves + (buy_amount * 0.9975) >= target_cap
  // 
  // Strategy: set target = realSol + 1 lamport. Then buy enough that after fees we exceed it.
  // Buy 0.005 SOL (5M lamports). After 0.25% fee = 4,987,500 lamports net.
  // That's way more than 1 lamport headroom. This WILL trigger graduation.
  const newTarget = realSol + 1; // exactly 1 lamport above current
  console.log("Setting target to:", newTarget, "lamports (current + 1)");
  console.log("  =", newTarget / LAMPORTS_PER_SOL, "SOL");

  const updateIx = await program.methods
    .updateGlobal(feeBps, new BN(newTarget), FEE_RECIPIENT, usdcMint, usdtMint)
    .accountsStrict({ globalConfig: globalPda, admin: admin.publicKey })
    .instruction();

  let tx = new Transaction().add(updateIx);
  let { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash; tx.feePayer = admin.publicKey; tx.sign(admin);
  let sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log("✅ Target set");

  // Buy 0.01 SOL — only ~1000 lamports will be used (capped at remaining), triggers graduation
  console.log("Buying 0.005 SOL to trigger graduation (after fee, will exceed target)...");
  const buyIx = await program.methods.buy(new BN(Math.floor(0.005 * LAMPORTS_PER_SOL)), new BN(0))
    .accountsStrict({
      bondingCurve: curvePda,
      solVault: new PublicKey(step1.solVaultPda),
      curveTokenAccount: new PublicKey(step1.curveTokenAccount),
      userTokenAccount: buyerAta,
      mint: mintPubkey,
      user: admin.publicKey,
      globalConfig: globalPda,
      feeRecipient: FEE_RECIPIENT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).instruction();

  tx = new Transaction().add(buyIx);
  ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash());
  tx.recentBlockhash = blockhash; tx.feePayer = admin.publicKey; tx.sign(admin);
  sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  const graduationTx = sig;
  console.log("✅ Buy confirmed:", sig.slice(0, 30) + "...");

  // Check
  ci = await conn.getAccountInfo(curvePda);
  realSol = Number(ci.data.readBigUInt64LE(88));
  complete = ci.data[104] === 1;
  console.log("\n🎓 Complete:", complete, "| SOL:", realSol / LAMPORTS_PER_SOL);

  // Restore target to 85 SOL
  console.log("Restoring target to 85 SOL...");
  const restoreIx = await program.methods
    .updateGlobal(feeBps, new BN(85 * LAMPORTS_PER_SOL), FEE_RECIPIENT, usdcMint, usdtMint)
    .accountsStrict({ globalConfig: globalPda, admin: admin.publicKey })
    .instruction();
  tx = new Transaction().add(restoreIx);
  ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash());
  tx.recentBlockhash = blockhash; tx.feePayer = admin.publicKey; tx.sign(admin);
  sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log("✅ Target restored to 85 SOL");

  console.log("\n═══════════════════════════════════════════════════════════");
  if (complete) {
    console.log("  🎓 STEP 4 COMPLETE — BONDING CURVE GRADUATED!");
  } else {
    console.log("  ⚠ Graduation flag not set — check contract logic");
  }
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("Graduation TX:", "https://explorer.solana.com/tx/" + graduationTx + "?cluster=devnet");
  console.log("Curve:        ", "https://explorer.solana.com/address/" + curvePda.toBase58() + "?cluster=devnet");

  const result = {
    step: 4, name: "Graduation",
    mintAddress: step1.mintAddress,
    curvePda: step1.curvePda,
    totalSOLRaised: realSol / LAMPORTS_PER_SOL,
    complete,
    graduationTx: "https://explorer.solana.com/tx/" + graduationTx + "?cluster=devnet",
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync("scripts/e2e-step4-result.json", JSON.stringify(result, null, 2));
  console.log("✅ Results saved → scripts/e2e-step4-result.json");
}

main().catch(e => {
  console.error("ERROR:", e.message);
  if (e.logs) e.logs.forEach(l => console.log(" ", l));
});
