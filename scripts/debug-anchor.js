const { Program, AnchorProvider } = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require("@solana/spl-token");
const { createHash } = require("crypto");
const fs = require("fs");

let json = fs.readFileSync("lib/idl.json", "utf8");
json = json.replaceAll('"publicKey"', '"pubkey"');
const idl = JSON.parse(json);

for (const acc of idl.accounts) {
  if (acc.type && acc.type.kind === "struct") {
    if (!idl.types.find(t => t.name === acc.name)) idl.types.push({ name: acc.name, type: acc.type });
  }
  if (!acc.discriminator) {
    acc.discriminator = Array.from(createHash("sha256").update("account:" + acc.name).digest().slice(0, 8));
  }
}
for (const ix of idl.instructions) {
  if (!ix.discriminator) {
    const sn = ix.name.replace(/[A-Z]/g, (c, i) => i === 0 ? c.toLowerCase() : "_" + c.toLowerCase());
    ix.discriminator = Array.from(createHash("sha256").update("global:" + sn).digest().slice(0, 8));
  }
}

const PROGRAM_ID = new PublicKey("DrVK92avUZvKHbyxd3StwX9c3zkZf5nDNoBrgU32e1NE");
const conn = new Connection("https://api.devnet.solana.com");
const kp = Keypair.generate();
const wallet = { publicKey: kp.publicKey, signTransaction: async t => t, signAllTransactions: async t => t };
const provider = new AnchorProvider(conn, wallet, {});
const program = new Program(idl, provider);

const mint = Keypair.generate();
const [curvePda] = PublicKey.findProgramAddressSync([Buffer.from("curve"), mint.publicKey.toBuffer()], PROGRAM_ID);
const [solVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("sol_vault"), mint.publicKey.toBuffer()], PROGRAM_ID);
const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID);
const curveAta = getAssociatedTokenAddressSync(mint.publicKey, curvePda, true);

async function main() {
  const ix = await program.methods.createPool("test", 0)
    .accountsStrict({
      bondingCurve: curvePda,
      solVault: solVaultPda,
      curveTokenAccount: curveAta,
      mint: mint.publicKey,
      creator: kp.publicKey,
      quoteMint: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      globalConfig: globalPda,
    })
    .instruction();

  console.log("Instruction keys from Anchor builder:");
  ix.keys.forEach((k, i) => {
    console.log(`  ${i}: isMut=${String(k.isMut).padEnd(5)} isSigner=${String(k.isSigner).padEnd(5)} ${k.pubkey.toBase58()}`);
  });
  console.log("\nData hex:", Buffer.from(ix.data).toString("hex").slice(0, 40) + "...");
  console.log("Data bytes[0..8]:", Array.from(ix.data.slice(0, 8)));
}
main().catch(e => console.error(e.message));
