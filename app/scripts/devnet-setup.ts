// Creates two test tokens on devnet and mints them to your wallet so you can
// try the whole flow (sell, buy, private deals, Blinks) without real money.
//   npm run devnet:setup -- ~/.config/solana/id.json [recipientWallet]
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import fs from "node:fs";
import os from "node:os";

async function main() {
  const kpPath = (process.argv[2] ?? "~/.config/solana/id.json").replace("~", os.homedir());
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf8"))));
  const to = process.argv[3] ? new PublicKey(process.argv[3]) : payer.publicKey;
  const conn = new Connection(process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet"), "confirmed");
  console.log("Payer", payer.publicKey.toBase58(), "balance", (await conn.getBalance(payer.publicKey)) / 1e9, "SOL");
  for (const [name, dec, supply] of [["TESTMEME", 6, 1_000_000_000], ["TESTCOIN", 9, 1_000_000]] as const) {
    const mint = await createMint(conn, payer, payer.publicKey, null, dec);
    const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, to);
    await mintTo(conn, payer, mint, ata.address, payer, BigInt(supply) * 10n ** BigInt(dec));
    console.log(`${name}: ${mint.toBase58()}  (minted ${supply.toLocaleString()} to ${to.toBase58()})`);
  }
  console.log("\nPaste a mint into Create deal. Fund a second wallet with `solana airdrop 2 <addr> -u devnet` to act as taker.");
}
main().catch((e) => (console.error(e), process.exit(1)));
