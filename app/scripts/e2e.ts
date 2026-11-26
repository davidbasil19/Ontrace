// End-to-end test: real compiled program (program/target/deploy/ontrace_otc.so) in LiteSVM,
// driven by the exact same client code the web app and Blinks use (lib/program.ts).
// Run: npx tsx scripts/e2e.ts
import { Clock, FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  unpackAccount,
} from "@solana/spl-token";
import path from "node:path";
import { PROGRAM_ID } from "../lib/config";
import {
  buildCancelTx,
  buildCreateOfferTx,
  buildTakeTx,
  closeExpiredIx,
  delegatePda,
  fetchOffer,
  offerStatuses,
  parseEvents,
  type Offer,
} from "../lib/program";

const svm = new LiteSVM().withNativeMints(); // wSOL mint exists on real clusters
svm.addProgramFromFile(PROGRAM_ID, path.join(__dirname, "../../program/target/deploy/ontrace_otc.so"));
const NOW = BigInt(Math.floor(Date.now() / 1000));
const setTime = (t: bigint) => svm.setClock(new Clock(100n, t, 0n, 0n, t));
setTime(NOW);

// Minimal Connection shim over LiteSVM so lib/program.ts runs unmodified.
const toInfo = (a: PublicKey) => {
  const x = svm.getAccount(a);
  return x && x.lamports > 0 ? { ...x, data: Buffer.from(x.data), owner: x.owner, lamports: x.lamports, executable: x.executable, rentEpoch: 0 } : null;
};
const conn = {
  getAccountInfo: async (a: PublicKey) => toInfo(a),
  getMultipleAccountsInfo: async (as: PublicKey[]) => as.map(toInfo),
  getLatestBlockhash: async () => ({ blockhash: svm.latestBlockhash(), lastValidBlockHeight: 1000 }),
  getTokenAccountBalance: async (a: PublicKey) => {
    const i = toInfo(a);
    if (!i) throw new Error("no account");
    return { value: { amount: unpackAccount(a, i as any, i.owner).amount.toString() } };
  },
} as unknown as Connection;

let pass = 0;
let last: unknown;
function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg + "\n" + errLogs(last));
  pass++;
  console.log("  ✓", msg);
}
function send(tx: Transaction, ...signers: Keypair[]) {
  tx.recentBlockhash = svm.latestBlockhash();
  tx.sign(...signers);
  const r = svm.sendTransaction(tx);
  last = r;
  svm.expireBlockhash();
  return r;
}
const failed = (r: unknown) => r instanceof FailedTransactionMetadata;
const errLogs = (r: unknown) => (r instanceof FailedTransactionMetadata ? r.meta().logs().join("\n") : "");
const bal = (owner: PublicKey, mint: PublicKey, prog = TOKEN_PROGRAM_ID) => {
  const a = getAssociatedTokenAddressSync(mint, owner, true, prog);
  const i = toInfo(a);
  return i ? unpackAccount(a, i as any, prog).amount : 0n;
};
const tokAcc = (owner: PublicKey, mint: PublicKey, prog = TOKEN_PROGRAM_ID) => {
  const a = getAssociatedTokenAddressSync(mint, owner, true, prog);
  return unpackAccount(a, toInfo(a) as any, prog);
};
const sol = (k: PublicKey) => svm.getBalance(k) ?? 0n;

function makeMint(authority: Keypair, decimals: number, prog = TOKEN_PROGRAM_ID) {
  const mint = Keypair.generate();
  const tx = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: authority.publicKey, newAccountPubkey: mint.publicKey, lamports: 1_000_000_000, space: MINT_SIZE, programId: prog }),
    createInitializeMint2Instruction(mint.publicKey, decimals, authority.publicKey, null, prog),
  );
  tx.feePayer = authority.publicKey;
  if (failed(send(tx, authority, mint))) throw new Error("mint create failed");
  return mint.publicKey;
}
function mintTo(authority: Keypair, mint: PublicKey, to: PublicKey, amount: bigint, prog = TOKEN_PROGRAM_ID) {
  const ata = getAssociatedTokenAddressSync(mint, to, true, prog);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata, to, mint, prog),
    createMintToInstruction(mint, ata, authority.publicKey, amount, [], prog),
  );
  tx.feePayer = authority.publicKey;
  if (failed(send(tx, authority))) throw new Error("mintTo failed");
}
const asOffer = async (addr: string) => (await fetchOffer(conn, addr)) as Offer;

async function main() {
  const admin = Keypair.generate(), maker = Keypair.generate(), taker = Keypair.generate(), stranger = Keypair.generate();
  for (const k of [admin, maker, taker, stranger]) svm.airdrop(k.publicKey, 100n * BigInt(LAMPORTS_PER_SOL));

  const MEME = makeMint(admin, 6); // classic SPL, like most memecoins
  const USDC = makeMint(admin, 6);
  const T22 = makeMint(admin, 9, TOKEN_2022_PROGRAM_ID); // Token-2022 mint
  mintTo(admin, MEME, maker.publicKey, 1_000_000_000n); // 1000 MEME
  mintTo(admin, USDC, taker.publicKey, 500_000_000n); // 500 USDC
  mintTo(admin, USDC, stranger.publicKey, 100_000_000n); // 100 USDC
  mintTo(admin, T22, taker.publicKey, 50_000_000_000n, TOKEN_2022_PROGRAM_ID); // 50 T22
  const exp = Number(NOW) + 3600;

  console.log("\n1) Sell offer for SOL, open to anyone");
  const c1 = await buildCreateOfferTx(conn, maker.publicKey, {
    giveMint: MEME.toBase58(), giveAmount: 100_000_000n, wantMint: NATIVE_MINT.toBase58(), wantAmount: 2n * BigInt(LAMPORTS_PER_SOL), expiresAt: exp,
  });
  let r = send(c1.tx, maker);
  ok(!failed(r), "create_offer succeeds " + errLogs(r));
  ok(bal(maker.publicKey, MEME) === 1_000_000_000n, "tokens stay in maker wallet (no escrow)");
  let a = tokAcc(maker.publicKey, MEME);
  ok(a.delegate?.equals(delegatePda()) && a.delegatedAmount === 100_000_000n, "delegate approved for exactly 100");
  const createdEv = parseEvents((r as TransactionMetadata).logs());
  ok(createdEv[0]?.kind === "created" && createdEv[0].offer === c1.offer, "OfferCreated event parsed");

  console.log("\n2) Private offer for USDC stacks the allowance");
  const c2 = await buildCreateOfferTx(conn, maker.publicKey, {
    giveMint: MEME.toBase58(), giveAmount: 50_000_000n, wantMint: USDC.toBase58(), wantAmount: 30_000_000n, taker: taker.publicKey.toBase58(), expiresAt: exp,
  });
  ok(!failed(send(c2.tx, maker)), "second offer created");
  ok(tokAcc(maker.publicKey, MEME).delegatedAmount === 150_000_000n, "allowance = 100 + 50");
  const st = await offerStatuses(conn, [await asOffer(c1.offer), await asOffer(c2.offer)]);
  ok(st[c1.offer] === "live" && st[c2.offer] === "live", "both offers report live");

  console.log("\n3) Private offer rejects other wallets");
  r = send(await buildTakeTx(conn, stranger.publicKey, await asOffer(c2.offer)), stranger);
  ok(failed(r) && errLogs(r).includes("NotAllowedTaker"), "stranger blocked from private deal");
  r = send(await buildTakeTx(conn, maker.publicKey, await asOffer(c1.offer)), maker);
  ok(failed(r) && errLogs(r).includes("SelfTrade"), "maker can't take own deal");

  console.log("\n4) Take the SOL offer atomically");
  const mSol0 = sol(maker.publicKey);
  r = send(await buildTakeTx(conn, stranger.publicKey, await asOffer(c1.offer)), stranger);
  ok(!failed(r), "take_offer_sol succeeds " + errLogs(r));
  ok(bal(stranger.publicKey, MEME) === 100_000_000n, "taker received 100 MEME");
  ok(sol(maker.publicKey) - mSol0 >= 2n * BigInt(LAMPORTS_PER_SOL), "maker received 2 SOL (+ offer rent back)");
  ok((await fetchOffer(conn, c1.offer)) === null, "offer account closed");
  ok(tokAcc(maker.publicKey, MEME).delegatedAmount === 50_000_000n, "allowance drops to 50");
  const takenEv = parseEvents((r as TransactionMetadata).logs());
  ok(takenEv[0]?.kind === "taken" && takenEv[0].taker === stranger.publicKey.toBase58(), "OfferTaken event parsed");

  console.log("\n5) Take the private USDC offer");
  r = send(await buildTakeTx(conn, taker.publicKey, await asOffer(c2.offer)), taker);
  ok(!failed(r), "take_offer_token succeeds " + errLogs(r));
  ok(bal(taker.publicKey, MEME) === 50_000_000n && bal(maker.publicKey, USDC) === 30_000_000n, "both legs settled");
  ok(bal(maker.publicKey, MEME) === 850_000_000n, "maker MEME 1000 → 850");

  console.log("\n6) Buy offer paying SOL for a Token-2022 token");
  const c3 = await buildCreateOfferTx(conn, maker.publicKey, {
    giveMint: NATIVE_MINT.toBase58(), giveAmount: 1n * BigInt(LAMPORTS_PER_SOL), wantMint: T22.toBase58(), wantAmount: 10_000_000_000n, expiresAt: exp,
  });
  r = send(c3.tx, maker);
  ok(!failed(r), "buy offer created (SOL auto-wrapped) " + errLogs(r));
  const tSol0 = sol(taker.publicKey);
  r = send(await buildTakeTx(conn, taker.publicKey, await asOffer(c3.offer)), taker);
  ok(!failed(r), "taker sells T22 into the buy offer " + errLogs(r));
  ok(bal(maker.publicKey, T22, TOKEN_2022_PROGRAM_ID) === 10_000_000_000n, "maker got 10 T22");
  ok(sol(taker.publicKey) > tSol0 + 990_000_000n, "taker got ~1 SOL back as native SOL (unwrapped)");
  ok(toInfo(getAssociatedTokenAddressSync(NATIVE_MINT, taker.publicKey)) === null, "taker wSOL account closed");

  console.log("\n7) Cancel revokes allowance");
  const c4 = await buildCreateOfferTx(conn, maker.publicKey, {
    giveMint: MEME.toBase58(), giveAmount: 10_000_000n, wantMint: NATIVE_MINT.toBase58(), wantAmount: 1_000_000n, expiresAt: exp,
  });
  send(c4.tx, maker);
  r = send(await buildCancelTx(conn, maker.publicKey, await asOffer(c4.offer)), maker);
  ok(!failed(r), "cancel succeeds " + errLogs(r));
  ok((await fetchOffer(conn, c4.offer)) === null, "offer closed");
  ok(tokAcc(maker.publicKey, MEME).delegate === null, "delegate revoked when nothing left open");

  console.log("\n8) Unfunded offers can't be taken");
  const c5 = await buildCreateOfferTx(conn, maker.publicKey, {
    giveMint: MEME.toBase58(), giveAmount: 800_000_000n, wantMint: NATIVE_MINT.toBase58(), wantAmount: 1_000_000n, expiresAt: exp,
  });
  send(c5.tx, maker);
  const dump = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(maker.publicKey, getAssociatedTokenAddressSync(MEME, admin.publicKey), admin.publicKey, MEME),
    createTransferInstruction(getAssociatedTokenAddressSync(MEME, maker.publicKey), getAssociatedTokenAddressSync(MEME, admin.publicKey), maker.publicKey, 500_000_000n),
  );
  dump.feePayer = maker.publicKey;
  send(dump, maker);
  ok((await offerStatuses(conn, [await asOffer(c5.offer)]))[c5.offer] === "unfunded", "status flips to unfunded");
  r = send(await buildTakeTx(conn, taker.publicKey, await asOffer(c5.offer)), taker);
  ok(failed(r), "take fails, nothing moves");
  ok(bal(taker.publicKey, MEME) === 50_000_000n, "taker balance unchanged");

  console.log("\n9) Expiry");
  setTime(NOW + 7200n);
  r = send(await buildTakeTx(conn, taker.publicKey, await asOffer(c5.offer)), taker);
  ok(failed(r) && errLogs(r).includes("Expired"), "expired offer can't be taken");
  const ce = new Transaction().add(closeExpiredIx(stranger.publicKey, await asOffer(c5.offer)));
  ce.feePayer = stranger.publicKey;
  r = send(ce, stranger);
  ok(!failed(r), "anyone can close an expired offer " + errLogs(r));

  console.log("\n10) Validation");
  setTime(NOW);
  const bad = await buildCreateOfferTx(conn, maker.publicKey, {
    giveMint: MEME.toBase58(), giveAmount: 1n, wantMint: NATIVE_MINT.toBase58(), wantAmount: 1n, expiresAt: Number(NOW) + 31 * 86400,
  });
  ok(failed(send(bad.tx, maker)), "rejects expiry > 30 days");
  const tooMuch = await buildCreateOfferTx(conn, maker.publicKey, {
    giveMint: MEME.toBase58(), giveAmount: 10_000_000_000n, wantMint: NATIVE_MINT.toBase58(), wantAmount: 1n, expiresAt: exp,
  });
  r = send(tooMuch.tx, maker);
  ok(failed(r) && errLogs(r).includes("InsufficientBalance"), "rejects offering more than you hold");

  console.log(`\nAll ${pass} checks passed.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
