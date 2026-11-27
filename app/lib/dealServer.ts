// Server-side deal logic: validation, storage, on-chain status checks.
import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { NATIVE_MINT_STR, SERVER_RPC_URL } from "./config";
import {
  type DealTerms,
  getMintMeta,
  isFillOf,
  readNonce,
  readNonceSlots,
  verifySignedSwap,
} from "./deals";
import { assertKV, kv } from "./store";
import type { OfferJSON } from "./serialize";

export let serverConn = new Connection(SERVER_RPC_URL, "confirmed");
/** Test hook: point the server logic at another connection (e.g. a local Solana VM). */
export function __setConnection(c: Connection) {
  serverConn = c;
}
const MAX_DURATION = 30 * 24 * 3600;

export interface Confirmation {
  tx: string; // seller-signed swap, base64
  at: number;
}
export interface DealRecord extends DealTerms {
  kind: "instant" | "request";
  state: "open" | "filled" | "cancelled";
  nonce?: string;
  nonceValue?: string;
  signedTx?: string; // instant deals
  confirmations: Record<string, Confirmation>; // request deals: buyer -> signed tx
  requests: Record<string, number>; // buyer -> time
  filledBy?: string;
  fillSig?: string;
  closedAt?: number;
  checkedAt?: number;
  funded?: boolean;
}

export interface DealEvent {
  kind: "created" | "filled" | "cancelled";
  id: string;
  maker: string;
  taker?: string | null;
  giveMint: string;
  giveAmount: string;
  wantMint: string;
  wantAmount: string;
  time: number;
  sig?: string;
}

const K = {
  deal: (id: string) => `deal:${id}`,
  open: "deals:open",
  events: "events",
};

export const getDeal = (id: string) => kv.get<DealRecord>(K.deal(id));
async function saveDeal(d: DealRecord) {
  await kv.set(K.deal(d.id), d);
  if (d.state === "open") await kv.sadd(K.open, d.id);
  else await kv.srem(K.open, d.id);
}
async function event(d: DealRecord, kind: DealEvent["kind"], extra: Partial<DealEvent> = {}) {
  await kv.lpush(
    K.events,
    { kind, id: d.id, maker: d.maker, taker: d.taker, giveMint: d.giveMint, giveAmount: d.giveAmount, wantMint: d.wantMint, wantAmount: d.wantAmount, time: Math.floor(Date.now() / 1000), ...extra },
    100,
  );
}
export const listEvents = () => kv.lrange<DealEvent>(K.events, 30);

// ---------------------------------------------------------------- validation

const isKey = (s: unknown) => {
  try {
    return typeof s === "string" && !!new PublicKey(s);
  } catch {
    return false;
  }
};

export function validateTerms(t: DealTerms): string | null {
  const now = Date.now() / 1000;
  if (!t || typeof t.id !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{12,24}$/.test(t.id)) return "Bad deal id";
  if (!isKey(t.maker) || !isKey(t.giveMint) || !isKey(t.wantMint)) return "Bad address";
  if (t.taker !== null && !isKey(t.taker)) return "Bad counterparty";
  if (t.taker === t.maker) return "You can't trade with yourself";
  if (t.giveMint === t.wantMint) return "Token and payment must differ";
  if (!/^\d+$/.test(t.giveAmount) || !/^\d+$/.test(t.wantAmount) || BigInt(t.giveAmount) <= 0n || BigInt(t.wantAmount) <= 0n) return "Amounts must be above zero";
  if (BigInt(t.giveAmount) > 2n ** 64n - 1n || BigInt(t.wantAmount) > 2n ** 64n - 1n) return "Amount too large";
  if (!(t.expiresAt > now && t.expiresAt - now <= MAX_DURATION)) return "Expiry must be within 30 days";
  if (Math.abs(t.createdAt - now) > 600) return "Clock mismatch, refresh and try again";
  return null;
}

/** Nonce accounts referenced by the maker's unsettled deals (still able to execute). */
async function busyNonces(maker: string) {
  const ids = await kv.smembers(K.open);
  const deals = (await Promise.all(ids.map(getDeal))).filter((d): d is DealRecord => !!d && d.maker === maker && !!d.nonce);
  return new Map(deals.map((d) => [d.nonce!, d]));
}

export async function nonceSlotsFor(maker: string) {
  const slots = await readNonceSlots(serverConn, new PublicKey(maker));
  const busy = await busyNonces(maker);
  return slots.map((s) => {
    const d = busy.get(s.address);
    const inUse = !!d && d.nonceValue === s.value;
    return { ...s, free: s.exists && s.authority === maker && !!s.value && !inUse, busyDeal: inUse ? d!.id : null };
  });
}

async function checkNonce(maker: string, nonce: string, nonceValue: string, dealId: string) {
  const slots = await nonceSlotsFor(maker);
  const s = slots.find((x) => x.address === nonce);
  if (!s) return "Unknown deposit account";
  if (s.authority !== maker) return "Deposit account isn't yours";
  if (s.value !== nonceValue) return "Deposit account changed, try again";
  if (s.busyDeal && s.busyDeal !== dealId) return "Deposit account is in use by another deal";
  return null;
}

// ---------------------------------------------------------------- actions

export async function createInstant(t: DealTerms, nonce: string, nonceValue: string, signedTx: string) {
  assertKV();
  const bad = validateTerms(t);
  if (bad) return bad;
  if (!t.taker) return "Instant deals need a counterparty wallet";
  if (await getDeal(t.id)) return "Deal already exists";
  const n = await checkNonce(t.maker, nonce, nonceValue, t.id);
  if (n) return n;
  const v = await verifySignedSwap(serverConn, { terms: t, buyer: t.taker, nonce, nonceValue }, signedTx);
  if (v) return v;
  const d: DealRecord = { ...t, kind: "instant", state: "open", nonce, nonceValue, signedTx, confirmations: {}, requests: {} };
  await saveDeal(d);
  await event(d, "created");
  return null;
}

export async function createListing(t: DealTerms) {
  assertKV();
  const bad = validateTerms(t);
  if (bad) return bad;
  if (t.taker) return "Listings are open to anyone";
  if (await getDeal(t.id)) return "Deal already exists";
  await getMintMeta(serverConn, t.giveMint);
  if (t.wantMint !== NATIVE_MINT_STR) await getMintMeta(serverConn, t.wantMint);
  const d: DealRecord = { ...t, kind: "request", state: "open", confirmations: {}, requests: {} };
  await saveDeal(d);
  await event(d, "created");
  return null;
}

export async function addRequest(d: DealRecord, buyer: string) {
  if (d.kind !== "request") return "This deal doesn't take requests";
  if (buyer === d.maker) return "You can't request your own deal";
  if (d.state !== "open" || d.expiresAt <= Date.now() / 1000) return "This deal is closed";
  d.requests[buyer] = Math.floor(Date.now() / 1000);
  await saveDeal(d);
  return null;
}

export async function confirmBuyer(d: DealRecord, buyer: string, nonce: string, nonceValue: string, signedTx: string) {
  if (d.kind !== "request") return "Not a request deal";
  if (d.state !== "open" || d.expiresAt <= Date.now() / 1000) return "This deal is closed";
  if (!d.requests[buyer]) return "That wallet hasn't requested this deal";
  if (d.nonce && (d.nonce !== nonce || d.nonceValue !== nonceValue)) return "Use this deal's existing deposit account";
  const n = await checkNonce(d.maker, nonce, nonceValue, d.id);
  if (n) return n;
  const v = await verifySignedSwap(serverConn, { terms: d, buyer, nonce, nonceValue }, signedTx);
  if (v) return v;
  d.nonce = nonce;
  d.nonceValue = nonceValue;
  d.confirmations[buyer] = { tx: signedTx, at: Math.floor(Date.now() / 1000) };
  await saveDeal(d);
  return null;
}

/** Signed swap a given wallet may take, if any. */
export function txFor(d: DealRecord, account: string): string | null {
  if (d.state !== "open" || d.expiresAt <= Date.now() / 1000) return null;
  if (d.kind === "instant") return d.taker === account ? d.signedTx ?? null : null;
  return d.confirmations[account]?.tx ?? null;
}

export async function markCancelled(d: DealRecord) {
  if (d.state !== "open") return "Deal already closed";
  if (d.nonce) {
    const cur = await readNonce(serverConn, d.nonce);
    if (cur === d.nonceValue) return "Send the cancel transaction first";
  }
  d.state = "cancelled";
  d.closedAt = Math.floor(Date.now() / 1000);
  await saveDeal(d);
  await event(d, "cancelled");
  return null;
}

export async function recordFill(d: DealRecord, sig: string) {
  if (d.state === "filled") return null;
  const tx = await serverConn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx || tx.meta?.err || !isFillOf(tx.meta?.logMessages, d.id)) return "Transaction doesn't fill this deal";
  const payer = tx.transaction.message.getAccountKeys().get(0)?.toBase58();
  return fill(d, payer ?? "", sig);
}

async function fill(d: DealRecord, taker: string, sig: string) {
  d.state = "filled";
  d.filledBy = taker;
  d.fillSig = sig;
  d.closedAt = Math.floor(Date.now() / 1000);
  await saveDeal(d);
  await event(d, "filled", { taker, sig });
  return null;
}

// ---------------------------------------------------------------- status

async function makerHolds(d: DealRecord) {
  try {
    if (d.giveMint === NATIVE_MINT_STR) return BigInt(await serverConn.getBalance(new PublicKey(d.maker))) >= BigInt(d.giveAmount);
    const m = await getMintMeta(serverConn, d.giveMint);
    const ata = getAssociatedTokenAddressSync(new PublicKey(d.giveMint), new PublicKey(d.maker), true, m.tokenProgram);
    const b = await serverConn.getTokenAccountBalance(ata);
    return BigInt(b.value.amount) >= BigInt(d.giveAmount);
  } catch {
    return false;
  }
}

/** Re-checks an open deal against the chain (at most every 15s). */
export async function refresh(d: DealRecord, force = false): Promise<DealRecord> {
  if (d.state !== "open") return d;
  const now = Date.now();
  if (!force && d.checkedAt && now - d.checkedAt < 15_000) return d;
  if (d.nonce) {
    const cur = await readNonce(serverConn, d.nonce).catch(() => undefined);
    if (cur !== undefined && cur !== d.nonceValue) {
      // Nonce moved: the deal was either filled or cancelled on-chain.
      const sigs = await serverConn.getSignaturesForAddress(new PublicKey(d.nonce), { limit: 10 }).catch(() => []);
      for (const s of sigs.filter((x) => !x.err)) {
        const tx = await serverConn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch(() => null);
        if (tx && isFillOf(tx.meta?.logMessages, d.id)) {
          await fill(d, tx.transaction.message.getAccountKeys().get(0)?.toBase58() ?? "", s.signature);
          return d;
        }
      }
      d.state = "cancelled";
      d.closedAt = Math.floor(now / 1000);
      await saveDeal(d);
      await event(d, "cancelled");
      return d;
    }
  }
  d.funded = await makerHolds(d);
  d.checkedAt = now;
  await saveDeal(d);
  return d;
}

export async function openDeals(): Promise<DealRecord[]> {
  assertKV();
  const ids = await kv.smembers(K.open);
  const deals = (await Promise.all(ids.map(getDeal))).filter((d): d is DealRecord => !!d);
  return Promise.all(deals.map((d) => refresh(d)));
}

// ---------------------------------------------------------------- public view

export type DealJSON = OfferJSON & {
  kind: "instant" | "request";
  state: DealRecord["state"];
  requests: string[];
  confirmed: string[];
  nonce: string | null;
  filledBy?: string;
  fillSig?: string;
};

export function toJSON(d: DealRecord): DealJSON {
  const now = Date.now() / 1000;
  const status = d.state !== "open" ? "expired" : d.expiresAt <= now ? "expired" : d.funded === false ? "unfunded" : "live";
  return {
    address: d.id,
    id: d.id,
    maker: d.maker,
    giveMint: d.giveMint,
    giveAmount: d.giveAmount,
    wantMint: d.wantMint,
    wantAmount: d.wantAmount,
    taker: d.taker,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt,
    status,
    kind: d.kind,
    state: d.state,
    requests: Object.keys(d.requests),
    confirmed: Object.keys(d.confirmations),
    nonce: d.nonce ?? null,
    filledBy: d.filledBy,
    fillSig: d.fillSig,
  };
}
