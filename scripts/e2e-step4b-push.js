// Quick extra buy to push curve past graduation target
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

  let ci = await conn.getAccountInfo(curvePda);
  let realSol = Number(ci.data.readBigUInt64LE(88));
  let complete = ci.data[104] === 1;
  console.log("Curve SOL:", realSol / LAMPORTS_PER_SOL, "| Complete:", complete);

  if (complete) { console.log("Already graduated!"); return; }

  const wa = { publicKey: admin.publicKey, signTransaction: async t => { t.partialSign(admin); return t; }, signAllTransactions: async t => { t.forEach(x => x.partialSign(admin)); return t; } };
  const provider = new AnchorProvider(conn, wa, { commitment: "confirmed" });
  const program = new Program(patchIdl(JSON.parse(fs.readFileSync("lib/idl.json", "utf8"))), provider);

  // Buy 0.1 SOL more
  const buyIx = await program.methods.buy(new BN(Math.floor(0.1 * LAMPORTS_PER_SOL)), new BN(0))
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

  const tx = new Transaction().add(buyIx);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

  ci = await conn.getAccountInfo(curvePda);
  realSol = Number(ci.data.readBigUInt64LE(88));
  complete = ci.data[104] === 1;
  console.log("\nAfter extra buy:");
  console.log("  SOL:", realSol / LAMPORTS_PER_SOL);
  console.log("  Complete:", complete);
  console.log("  TX:", "https://explorer.solana.com/tx/" + sig + "?cluster=devnet");

  // Update step4 result
  const result = {
    step: 4, name: "Graduation",
    mintAddress: step1.mintAddress,
    curvePda: step1.curvePda,
    totalSOLRaised: realSol / LAMPORTS_PER_SOL,
    complete,
    graduationTx: "https://explorer.solana.com/tx/" + sig + "?cluster=devnet",
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync("scripts/e2e-step4-result.json", JSON.stringify(result, null, 2));
  console.log("\n✅ Updated step4 result");
}

main().catch(e => {
  console.error("ERROR:", e.message);
  if (e.logs) e.logs.forEach(l => console.log(" ", l));
});
