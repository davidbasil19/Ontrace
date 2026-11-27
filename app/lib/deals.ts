// OnTrace deal engine: pre-signed swaps, no custom on-chain program.
//
// A deal is one Solana transaction that swaps both sides atomically:
//   1. advance the seller's durable nonce  (keeps the signed tx valid for days,
//      and lets the seller cancel by advancing it)
//   2. seller -> buyer : the tokens (or SOL)
//   3. buyer  -> seller: the payment (SOL, USDC or any token)
//   4. memo "ontrace:<dealId>" so fills can be found on-chain
// The seller signs first (terms locked: any change breaks the signature), the
// buyer adds their signature and submits. Fee payer = buyer.
//
// Works in the browser and on the server. Uses only System, Token, Token-2022,
// Associated Token and Memo programs, all already on every Solana cluster.

import {
  ComputeBudgetProgram,
  Connection,
  NONCE_ACCOUNT_LENGTH,
  NonceAccount,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { PRIORITY_FEE } from "./config";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const NONCE_SEED_PREFIX = "ontrace-";
export const MAX_NONCES = 24;

// ---------------------------------------------------------------- terms

export interface DealTerms {
  id: string;
  maker: string;
  giveMint: string;
  giveAmount: string; // raw integer
  wantMint: string;
  wantAmount: string; // raw integer
  taker: string | null; // null = open deal (request -> confirm)
  createdAt: number;
  expiresAt: number;
}

export function newDealId() {
  return bs58.encode(crypto.getRandomValues(new Uint8Array(12)));
}

const isNative = (m: string) => m === NATIVE_MINT.toBase58();

// ---------------------------------------------------------------- mints

export interface MintMeta {
  decimals: number;
  tokenProgram: PublicKey;
}
const mintCache = new Map<string, MintMeta>();

export async function getMintMeta(conn: Connection, mint: string): Promise<MintMeta> {
  if (isNative(mint)) return { decimals: 9, tokenProgram: TOKEN_PROGRAM_ID };
  const hit = mintCache.get(mint);
  if (hit) return hit;
  const info = await conn.getAccountInfo(new PublicKey(mint));
  if (!info) throw new Error(`Token ${mint} not found on this network`);
  if (!info.owner.equals(TOKEN_PROGRAM_ID) && !info.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new Error("Not a token mint");
  const meta = { decimals: info.data[44], tokenProgram: info.owner };
  mintCache.set(mint, meta);
  return meta;
}

// ---------------------------------------------------------------- nonces

export function nonceAddress(maker: PublicKey, index: number) {
  return PublicKey.createWithSeed(maker, NONCE_SEED_PREFIX + index, SystemProgram.programId);
}

export interface NonceSlot {
  index: number;
  address: string;
  exists: boolean;
  value: string | null; // current durable nonce (acts as blockhash)
  authority: string | null;
  lamports: number;
}

/** Reads the maker's deterministic nonce accounts (ontrace-0 ... ontrace-N). */
export async function readNonceSlots(conn: Connection, maker: PublicKey, count = MAX_NONCES): Promise<NonceSlot[]> {
  const addrs = await Promise.all(Array.from({ length: count }, (_, i) => nonceAddress(maker, i)));
  const infos = await conn.getMultipleAccountsInfo(addrs);
  return addrs.map((a, i) => {
    const info = infos[i];
    if (!info || info.data.length !== NONCE_ACCOUNT_LENGTH) {
      return { index: i, address: a.toBase58(), exists: !!info, value: null, authority: null, lamports: info?.lamports ?? 0 };
    }
    const n = NonceAccount.fromAccountData(info.data);
    return { index: i, address: a.toBase58(), exists: true, value: n.nonce, authority: n.authorizedPubkey.toBase58(), lamports: info.lamports };
  });
}

export async function readNonce(conn: Connection, address: string): Promise<string | null> {
  const info = await conn.getAccountInfo(new PublicKey(address));
  if (!info || info.data.length !== NONCE_ACCOUNT_LENGTH) return null;
  return NonceAccount.fromAccountData(info.data).nonce;
}

/** Creates and initializes nonce account #index, owned/authorized by the maker. */
export async function buildCreateNonceTx(conn: Connection, maker: PublicKey, index: number) {
  const noncePubkey = await nonceAddress(maker, index);
  const lamports = await conn.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
  const tx = new Transaction().add(
    SystemProgram.createAccountWithSeed({
      fromPubkey: maker,
      basePubkey: maker,
      seed: NONCE_SEED_PREFIX + index,
      newAccountPubkey: noncePubkey,
      lamports,
      space: NONCE_ACCOUNT_LENGTH,
      programId: SystemProgram.programId,
    }),
    SystemProgram.nonceInitialize({ noncePubkey, authorizedPubkey: maker }),
  );
  return finalize(conn, tx, maker);
}

/** Cancels every signed deal that uses this nonce (advances it). */
export async function buildCancelTx(conn: Connection, maker: PublicKey, nonce: string) {
  const tx = new Transaction().add(SystemProgram.nonceAdvance({ noncePubkey: new PublicKey(nonce), authorizedPubkey: maker }));
  return finalize(conn, tx, maker);
}

/** Closes free nonce accounts and returns their deposits to the maker. */
export async function buildReclaimTx(conn: Connection, maker: PublicKey, slots: { address: string; lamports: number }[]) {
  const tx = new Transaction();
  for (const s of slots.slice(0, 10))
    tx.add(SystemProgram.nonceWithdraw({ noncePubkey: new PublicKey(s.address), authorizedPubkey: maker, toPubkey: maker, lamports: s.lamports }));
  return finalize(conn, tx, maker);
}

function feeIxs() {
  return PRIORITY_FEE > 0
    ? [ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE })]
    : [];
}

async function finalize(conn: Connection, tx: Transaction, feePayer: PublicKey) {
  tx.instructions.unshift(...feeIxs());
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = feePayer;
  return tx;
}

// ---------------------------------------------------------------- swap

export interface SwapParams {
  terms: DealTerms;
  buyer: string;
  nonce: string; // nonce account address
  nonceValue: string; // durable nonce at signing time
}

/**
 * Builds the unsigned swap. Deterministic: the server rebuilds it with the same
 * params and compares bytes to prove a signed deal matches its listed terms.
 */
export async function buildSwapTx(conn: Connection, p: SwapParams) {
  const { terms } = p;
  const seller = new PublicKey(terms.maker);
  const buyer = new PublicKey(p.buyer);
  if (seller.equals(buyer)) throw new Error("You can't trade with yourself");
  if (terms.taker && terms.taker !== p.buyer) throw new Error("This deal is for a different wallet");

  const tx = new Transaction({
    feePayer: buyer,
    nonceInfo: {
      nonce: p.nonceValue,
      nonceInstruction: SystemProgram.nonceAdvance({ noncePubkey: new PublicKey(p.nonce), authorizedPubkey: seller }),
    },
  });
  const fee = feeIxs();
  if (fee.length) tx.add(...fee);
  tx.add(...(await leg(conn, terms.giveMint, BigInt(terms.giveAmount), seller, buyer, buyer)));
  tx.add(...(await leg(conn, terms.wantMint, BigInt(terms.wantAmount), buyer, seller, buyer)));
  tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(`ontrace:${terms.id}`) }));
  return tx;
}

async function leg(conn: Connection, mint: string, amount: bigint, from: PublicKey, to: PublicKey, payer: PublicKey) {
  if (isNative(mint)) return [SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: amount })];
  const m = await getMintMeta(conn, mint);
  const mintKey = new PublicKey(mint);
  const src = getAssociatedTokenAddressSync(mintKey, from, true, m.tokenProgram);
  const dst = getAssociatedTokenAddressSync(mintKey, to, true, m.tokenProgram);
  return [
    createAssociatedTokenAccountIdempotentInstruction(payer, dst, to, mintKey, m.tokenProgram),
    createTransferCheckedInstruction(src, mintKey, dst, from, amount, m.decimals, [], m.tokenProgram),
  ];
}

/** Server-side: rebuilds the swap and checks the seller's signature on it. */
export async function verifySignedSwap(conn: Connection, p: SwapParams, signedB64: string): Promise<string | null> {
  let signed: Transaction;
  try {
    signed = Transaction.from(Buffer.from(signedB64, "base64"));
  } catch {
    return "Signed deal is unreadable";
  }
  const expected = await buildSwapTx(conn, p);
  const msgA = signed.serializeMessage();
  const msgB = expected.serializeMessage();
  if (!Buffer.from(msgA).equals(Buffer.from(msgB))) return "Signed deal doesn't match its terms";
  const sig = signed.signatures.find((s) => s.publicKey.toBase58() === p.terms.maker)?.signature;
  if (!sig || !ed25519.verify(sig, msgA, new PublicKey(p.terms.maker).toBytes())) return "Seller signature is invalid";
  return null;
}

// ---------------------------------------------------------------- message auth

/** Text a wallet signs to prove it's them (no transaction, no fee). */
export const authMessage = (action: string, dealId: string, wallet: string, ts: number, extra = "") =>
  `OnTrace OTC\nAction: ${action}\nDeal: ${dealId}\nWallet: ${wallet}\n${extra ? extra + "\n" : ""}Time: ${ts}`;

export const listingExtra = (t: DealTerms) =>
  `Give: ${t.giveAmount} of ${t.giveMint}\nWant: ${t.wantAmount} of ${t.wantMint}\nExpires: ${t.expiresAt}`;

export function verifyWalletMessage(wallet: string, message: string, signatureB58: string, ts: number, maxAgeSec = 600) {
  if (Math.abs(Date.now() / 1000 - ts) > maxAgeSec) return "Signature expired, try again";
  try {
    const ok = ed25519.verify(bs58.decode(signatureB58), new TextEncoder().encode(message), new PublicKey(wallet).toBytes());
    return ok ? null : "Wallet signature is invalid";
  } catch {
    return "Wallet signature is invalid";
  }
}

// ---------------------------------------------------------------- helpers

export const txToB64 = (tx: Transaction) => Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
export const txFromB64 = (b64: string) => Transaction.from(Buffer.from(b64, "base64"));

/** Does this transaction's logs/memo show it filled deal `id`? */
export function isFillOf(logs: string[] | null | undefined, id: string) {
  return !!logs?.some((l) => l.includes(`ontrace:${id}`));
}
