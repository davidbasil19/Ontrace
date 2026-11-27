// End-to-end test of the $0 deal engine against a local Solana VM (LiteSVM).
// Uses the exact code the site runs: lib/deals.ts (client + server) and
// lib/dealServer.ts (validation, storage, status), plus the API route handlers.
// Run: npm test
import { Clock, FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  MINT_SIZE,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from "@solana/spl-token";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import * as S from "../lib/dealServer";
import {
  authMessage,
  buildCancelTx,
  buildCreateNonceTx,
  buildReclaimTx,
  buildSwapTx,
  listingExtra,
  newDealId,
  readNonce,
  txFromB64,
  txToB64,
  type DealTerms,
} from "../lib/deals";

// ---------------------------------------------------------------- local chain + Connection shim
const svm = new LiteSVM();
const now = () => BigInt(Math.floor(Date.now() / 1000));
svm.setClock(new Clock(100n, now(), 0n, 0n, now()));
type Log = { sig: string; keys: PublicKey[]; logs: string[]; err: unknown };
const history: Log[] = [];

const info = (k: PublicKey) => {
  const a = svm.getAccount(k);
  return a && a.lamports > 0 ? { ...a, data: Buffer.from(a.data), rentEpoch: 0 } : null;
};
const conn = {
  getAccountInfo: async (k: PublicKey) => info(k),
  getMultipleAccountsInfo: async (ks: PublicKey[]) => ks.map(info),
  getLatestBlockhash: async () => ({ blockhash: svm.latestBlockhash(), lastValidBlockHeight: 1e9 }),
  getMinimumBalanceForRentExemption: async (n: number) => Number(svm.minimumBalanceForRentExemption(BigInt(n))),
  getBalance: async (k: PublicKey) => Number(svm.getBalance(k) ?? 0n),
  getTokenAccountBalance: async (k: PublicKey) => {
    const i = info(k);
    if (!i) throw new Error("no account");
    return { value: { amount: unpackAccount(k, i as never, i.owner).amount.toString() } };
  },
  getSignaturesForAddress: async (k: PublicKey, o?: { limit?: number }) =>
    history.filter((h) => h.keys.some((x) => x.equals(k))).reverse().slice(0, o?.limit ?? 10).map((h) => ({ signature: h.sig, err: h.err })),
  getTransaction: async (sig: string) => {
    const h = history.find((x) => x.sig === sig);
    return h ? { meta: { err: h.err, logMessages: h.logs }, transaction: { message: { getAccountKeys: () => ({ get: (i: number) => h.keys[i] }) } } } : null;
  },
} as unknown as Connection;
S.__setConnection(conn);

let pass = 0;
const ok = (c: unknown, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
  pass++;
  console.log("  ✓", m);
};
function send(tx: Transaction): TransactionMetadata | FailedTransactionMetadata {
  const r = svm.sendTransaction(tx);
  const sig = bs58.encode(tx.signature ?? new Uint8Array(64));
  const keys = tx.compileMessage().accountKeys;
  history.push({ sig, keys, logs: r instanceof FailedTransactionMetadata ? r.meta().logs() : r.logs(), err: r instanceof FailedTransactionMetadata ? r.err() : null });
  svm.expireBlockhash();
  return r;
}
const sendSigned = (tx: Transaction, ...kp: Keypair[]) => {
  tx.partialSign(...kp);
  return send(tx);
};
const failed = (r: unknown) => r instanceof FailedTransactionMetadata;
const sigOf = (tx: Transaction) => bs58.encode(tx.signature!);
const bal = (o: PublicKey, m: PublicKey, p = TOKEN_PROGRAM_ID) => {
  const a = getAssociatedTokenAddressSync(m, o, true, p);
  const i = info(a);
  return i ? unpackAccount(a, i as never, p).amount : 0n;
};
const sol = (k: PublicKey) => svm.getBalance(k) ?? 0n;
const signMsg = (kp: Keypair, text: string) => bs58.encode(ed25519.sign(new TextEncoder().encode(text), kp.secretKey.slice(0, 32)));

function mint(auth: Keypair, decimals: number, prog = TOKEN_PROGRAM_ID) {
  const m = Keypair.generate();
  const tx = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: auth.publicKey, newAccountPubkey: m.publicKey, lamports: 1e9, space: MINT_SIZE, programId: prog }),
    createInitializeMint2Instruction(m.publicKey, decimals, auth.publicKey, null, prog),
  );
  tx.feePayer = auth.publicKey;
  tx.recentBlockhash = svm.latestBlockhash();
  if (failed(sendSigned(tx, auth, m))) throw new Error("mint");
  return m.publicKey;
}
function mintTo(auth: Keypair, m: PublicKey, to: PublicKey, amt: bigint, prog = TOKEN_PROGRAM_ID) {
  const ata = getAssociatedTokenAddressSync(m, to, true, prog);
  const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(auth.publicKey, ata, to, m, prog), createMintToInstruction(m, ata, auth.publicKey, amt, [], prog));
  tx.feePayer = auth.publicKey;
  tx.recentBlockhash = svm.latestBlockhash();
  if (failed(sendSigned(tx, auth))) throw new Error("mintTo");
}

// ---------------------------------------------------------------- client-side helpers (mirror lib/useDeals.ts)
async function freeNonce(maker: Keypair) {
  const slots = await S.nonceSlotsFor(maker.publicKey.toBase58());
  const free = slots.find((s) => s.free && s.value);
  if (free) return { nonce: free.address, nonceValue: free.value! };
  const empty = slots.find((s) => !s.exists)!;
  if (failed(sendSigned(await buildCreateNonceTx(conn, maker.publicKey, empty.index), maker))) throw new Error("nonce create");
  return { nonce: empty.address, nonceValue: (await readNonce(conn, empty.address))! };
}
const terms = (maker: Keypair, t: Partial<DealTerms>): DealTerms => ({
  id: newDealId(),
  maker: maker.publicKey.toBase58(),
  giveMint: "",
  giveAmount: "0",
  wantMint: NATIVE_MINT.toBase58(),
  wantAmount: "0",
  taker: null,
  createdAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  ...t,
});
async function makeInstant(maker: Keypair, t: DealTerms) {
  const { nonce, nonceValue } = await freeNonce(maker);
  const tx = await buildSwapTx(conn, { terms: t, buyer: t.taker!, nonce, nonceValue });
  tx.partialSign(maker);
  return { err: await S.createInstant(t, nonce, nonceValue, txToB64(tx)), nonce, nonceValue, signed: txToB64(tx) };
}
async function buyerTakes(id: string, buyer: Keypair) {
  const d = (await S.getDeal(id))!;
  const b64 = S.txFor(d, buyer.publicKey.toBase58());
  if (!b64) return { r: null as unknown as FailedTransactionMetadata, sig: "" };
  const tx = txFromB64(b64);
  tx.partialSign(buyer);
  const r = send(tx);
  return { r, sig: sigOf(tx) };
}

async function main() {
  const admin = Keypair.generate(), maker = Keypair.generate(), buyer = Keypair.generate(), stranger = Keypair.generate();
  for (const k of [admin, maker, buyer, stranger]) svm.airdrop(k.publicKey, 50n * BigInt(LAMPORTS_PER_SOL));
  const MEME = mint(admin, 6), USDC = mint(admin, 6), T22 = mint(admin, 9, TOKEN_2022_PROGRAM_ID);
  mintTo(admin, MEME, maker.publicKey, 1_000_000_000n);
  mintTo(admin, T22, maker.publicKey, 100_000_000_000n, TOKEN_2022_PROGRAM_ID);
  mintTo(admin, USDC, buyer.publicKey, 500_000_000n);
  mintTo(admin, T22, buyer.publicKey, 50_000_000_000n, TOKEN_2022_PROGRAM_ID);
  const M = maker.publicKey.toBase58(), B = buyer.publicKey.toBase58(), X = stranger.publicKey.toBase58();

  console.log("\n1) Instant private deal: sell MEME for SOL");
  const t1 = terms(maker, { giveMint: MEME.toBase58(), giveAmount: "100000000", wantAmount: String(2 * LAMPORTS_PER_SOL), taker: B });
  const d1 = await makeInstant(maker, t1);
  ok(d1.err === null, "seller signs once, deal stored " + (d1.err ?? ""));
  ok(bal(maker.publicKey, MEME) === 1_000_000_000n, "tokens still in seller's wallet");
  ok(S.toJSON((await S.refresh((await S.getDeal(t1.id))!, true))).status === "live", "deal shows live");

  console.log("\n2) Tampering and wrong signers are rejected");
  const t1b = { ...t1, id: newDealId(), wantAmount: "1" };
  const fake = await buildSwapTx(conn, { terms: t1, buyer: B, nonce: d1.nonce, nonceValue: d1.nonceValue });
  fake.partialSign(maker);
  ok((await S.createInstant(t1b, d1.nonce, d1.nonceValue, txToB64(fake))) !== null, "listing a lower price than what was signed fails");
  const t1c = terms(maker, { giveMint: MEME.toBase58(), giveAmount: "5", wantAmount: "5", taker: B });
  const fresh = await freeNonce(maker);
  const forged = await buildSwapTx(conn, { terms: t1c, buyer: B, ...fresh });
  forged.addSignature(maker.publicKey, Buffer.from(ed25519.sign(forged.serializeMessage(), stranger.secretKey.slice(0, 32))));
  ok(/signature/i.test((await S.createInstant(t1c, fresh.nonce, fresh.nonceValue, txToB64(forged))) ?? ""), "a fake seller signature is rejected");
  const reuse = await buildSwapTx(conn, { terms: t1c, buyer: B, nonce: d1.nonce, nonceValue: d1.nonceValue });
  reuse.partialSign(maker);
  ok(/in use/i.test((await S.createInstant(t1c, d1.nonce, d1.nonceValue, txToB64(reuse))) ?? ""), "a deposit already backing a live deal can't be reused");
  ok(S.txFor((await S.getDeal(t1.id))!, X) === null, "a stranger gets nothing to take");

  console.log("\n3) Buyer takes it atomically");
  const mSol = sol(maker.publicKey), bSol = sol(buyer.publicKey);
  const tk = await buyerTakes(t1.id, buyer);
  ok(!failed(tk.r), "take succeeds");
  ok(bal(buyer.publicKey, MEME) === 100_000_000n, "buyer received 100 MEME");
  ok(sol(maker.publicKey) - mSol === BigInt(2 * LAMPORTS_PER_SOL), "seller received exactly 2 SOL");
  ok(bSol - sol(buyer.publicKey) > BigInt(2 * LAMPORTS_PER_SOL), "buyer paid 2 SOL + fees (buyer pays the fee)");
  ok((await S.recordFill((await S.getDeal(t1.id))!, tk.sig)) === null, "fill recorded from on-chain memo");
  ok((await S.getDeal(t1.id))!.state === "filled", "deal marked filled");
  const replay = txFromB64(d1.signed);
  replay.partialSign(buyer);
  ok(failed(send(replay)), "the same signed deal can't be used twice");

  console.log("\n4) Open deal: request → confirm → buy (seller pays SOL for a Token-2022 token)");
  const t2 = terms(maker, { giveMint: NATIVE_MINT.toBase58(), giveAmount: String(LAMPORTS_PER_SOL), wantMint: T22.toBase58(), wantAmount: "10000000000" });
  const ts = Math.floor(Date.now() / 1000);
  const listRes = await (await import("../app/api/deals/route")).POST(
    new Request("http://x/api/deals", { method: "POST", body: JSON.stringify({ kind: "request", terms: t2, ts, signature: signMsg(maker, authMessage("list", t2.id, M, ts, listingExtra(t2))) }) }),
  );
  ok(listRes.status === 200, "listing created through the API with a free wallet signature");
  const badList = await (await import("../app/api/deals/route")).POST(
    new Request("http://x/api/deals", { method: "POST", body: JSON.stringify({ kind: "request", terms: { ...t2, id: newDealId() }, ts, signature: signMsg(stranger, authMessage("list", t2.id, M, ts, listingExtra(t2))) }) }),
  );
  ok(badList.status === 401, "can't list on someone else's behalf");
  let d2 = (await S.getDeal(t2.id))!;
  ok((await S.addRequest(d2, M)) !== null, "seller can't request own deal");
  ok((await S.addRequest(d2, B)) === null && (await S.addRequest((await S.getDeal(t2.id))!, X)) === null, "buyer and stranger both request");
  ok(S.txFor((await S.getDeal(t2.id))!, B) === null, "nothing to take before the seller confirms");
  const n2 = await freeNonce(maker);
  ok([d1.nonce, fresh.nonce].includes(n2.nonce), "seller's existing deposit is reused (no new deposit)");
  for (const who of [B, X]) {
    const tx = await buildSwapTx(conn, { terms: t2, buyer: who, ...n2 });
    tx.partialSign(maker);
    d2 = (await S.getDeal(t2.id))!;
    ok((await S.confirmBuyer(d2, who, n2.nonce, n2.nonceValue, txToB64(tx))) === null, `seller confirms ${who === B ? "buyer" : "stranger"}`);
  }
  const xTx = txFromB64(S.txFor((await S.getDeal(t2.id))!, X)!);
  const bT22 = bal(buyer.publicKey, T22, TOKEN_2022_PROGRAM_ID), bSol2 = sol(buyer.publicKey);
  const tk2 = await buyerTakes(t2.id, buyer);
  ok(!failed(tk2.r), "buyer completes first");
  ok(bal(maker.publicKey, T22, TOKEN_2022_PROGRAM_ID) === 110_000_000_000n, "seller got 10 Token-2022 tokens");
  ok(sol(buyer.publicKey) > bSol2 + 990_000_000n && bal(buyer.publicKey, T22, TOKEN_2022_PROGRAM_ID) === bT22 - 10_000_000_000n, "buyer got ~1 native SOL (no wrapping)");
  xTx.partialSign(stranger);
  ok(failed(send(xTx)), "stranger's confirmation now fails safely (only one can fill)");
  ok((await S.refresh((await S.getDeal(t2.id))!, true)).state === "filled", "server detects the fill on its own from the chain");

  console.log("\n5) Cancel");
  const t3 = terms(maker, { giveMint: MEME.toBase58(), giveAmount: "50000000", wantMint: USDC.toBase58(), wantAmount: "30000000", taker: B });
  const d3 = await makeInstant(maker, t3);
  ok(d3.err === null, "instant USDC deal created");
  const held = txFromB64(S.txFor((await S.getDeal(t3.id))!, B)!);
  ok((await S.markCancelled((await S.getDeal(t3.id))!)) !== null, "can't mark cancelled before the on-chain cancel");
  ok(!failed(sendSigned(await buildCancelTx(conn, maker.publicKey, d3.nonce), maker)), "seller sends the cancel (advances deposit)");
  ok((await S.markCancelled((await S.getDeal(t3.id))!)) === null, "deal marked cancelled");
  held.partialSign(buyer);
  ok(failed(send(held)), "a copy the buyer grabbed earlier no longer works");
  ok(bal(buyer.publicKey, USDC) === 500_000_000n, "buyer kept their USDC");

  console.log("\n6) Unfunded seller");
  const t4 = terms(maker, { giveMint: MEME.toBase58(), giveAmount: "800000000", wantAmount: "1000", taker: B });
  ok((await makeInstant(maker, t4)).err === null, "deal created");
  const dump = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(maker.publicKey, getAssociatedTokenAddressSync(MEME, admin.publicKey), admin.publicKey, MEME),
    createTransferInstruction(getAssociatedTokenAddressSync(MEME, maker.publicKey), getAssociatedTokenAddressSync(MEME, admin.publicKey), maker.publicKey, 500_000_000n),
  );
  dump.feePayer = maker.publicKey;
  dump.recentBlockhash = svm.latestBlockhash();
  sendSigned(dump, maker);
  ok(S.toJSON(await S.refresh((await S.getDeal(t4.id))!, true)).status === "unfunded", "status flips to unfunded");
  const memeBefore = bal(buyer.publicKey, MEME), solBefore = sol(buyer.publicKey);
  const tk4 = await buyerTakes(t4.id, buyer);
  ok(failed(tk4.r), "take fails");
  ok(bal(buyer.publicKey, MEME) === memeBefore && solBefore - sol(buyer.publicKey) <= 20_000n, "buyer lost nothing but a tiny network fee");

  console.log("\n7) Expiry, validation, busy deposits");
  const t5 = terms(maker, { giveMint: T22.toBase58(), giveAmount: "1000000000", wantMint: USDC.toBase58(), wantAmount: "1000000", taker: B, expiresAt: Math.floor(Date.now() / 1000) + 2 });
  const d5 = await makeInstant(maker, t5);
  ok(d5.err === null, "Token-2022 for USDC instant deal created");
  ok((await makeInstant(maker, terms(maker, { giveMint: MEME.toBase58(), giveAmount: "1", wantAmount: "1", taker: B }))).nonce !== d5.nonce, "a new deal gets its own deposit while others are busy");
  await new Promise((r) => setTimeout(r, 2500));
  ok(S.txFor((await S.getDeal(t5.id))!, B) === null, "expired deals aren't served any more");
  ok(S.validateTerms(terms(maker, { giveMint: MEME.toBase58(), giveAmount: "1", wantAmount: "1", expiresAt: Math.floor(Date.now() / 1000) + 31 * 86400 })) !== null, "rejects expiry > 30 days");
  ok(S.validateTerms(terms(maker, { giveMint: MEME.toBase58(), giveAmount: "0", wantAmount: "1" })) !== null, "rejects zero amounts");
  ok(S.validateTerms(terms(maker, { giveMint: MEME.toBase58(), giveAmount: "1", wantAmount: "1", taker: M })) !== null, "rejects trading with yourself");

  console.log("\n8) Reclaim deposits");
  for (const id of [t4.id, t5.id]) {
    const d = (await S.getDeal(id))!;
    sendSigned(await buildCancelTx(conn, maker.publicKey, d.nonce!), maker);
    await S.markCancelled(d);
  }
  const all = (await S.openDeals()).filter((d) => d.maker === M);
  for (const d of all) {
    sendSigned(await buildCancelTx(conn, maker.publicKey, d.nonce!), maker);
    await S.markCancelled((await S.getDeal(d.id))!);
  }
  const free = (await S.nonceSlotsFor(M)).filter((s) => s.free);
  ok(free.length >= 2, `${free.length} free deposits found`);
  const before = sol(maker.publicKey);
  ok(!failed(sendSigned(await buildReclaimTx(conn, maker.publicKey, free), maker)), "reclaim succeeds");
  ok(sol(maker.publicKey) > before, "deposits returned to the seller");
  ok((await S.nonceSlotsFor(M)).every((s) => !s.exists), "deposit accounts closed");

  console.log("\n9) Activity + public API");
  const ev = await S.listEvents();
  ok(ev.some((e) => e.kind === "filled") && ev.some((e) => e.kind === "cancelled") && ev.some((e) => e.kind === "created"), "activity feed has created / filled / cancelled");
  const list = await (await import("../app/api/deals/route")).GET({ nextUrl: new URL("http://x/api/deals?status=all") } as never);
  ok(list.status === 200, "deals list endpoint works");

  console.log(`\nAll ${pass} checks passed.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
