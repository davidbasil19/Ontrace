// Hand-rolled client for the OnTrace OTC Anchor program (program/programs/ontrace_otc).
// Works in the browser and on the server (used by the Blink action routes).
// Account order and arg layout MUST match lib.rs.

import {
  ComputeBudgetProgram,
  Connection,
  GetProgramAccountsFilter,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from "@solana/spl-token";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { PRIORITY_FEE, PROGRAM_ID } from "./config";

const enc = new TextEncoder();
const disc = (s: string) => sha256(enc.encode(s)).slice(0, 8);

const IX = {
  createOffer: disc("global:create_offer"),
  takeOfferSol: disc("global:take_offer_sol"),
  takeOfferToken: disc("global:take_offer_token"),
  cancelOffer: disc("global:cancel_offer"),
  closeExpired: disc("global:close_expired"),
};
export const OFFER_DISC = disc("account:Offer");
export const EVENT_DISC = {
  OfferCreated: disc("event:OfferCreated"),
  OfferTaken: disc("event:OfferTaken"),
  OfferClosed: disc("event:OfferClosed"),
};

export const OFFER_SIZE = 177;
const OFF = { maker: 8, id: 40, giveMint: 48, giveAmount: 80, wantMint: 88, wantAmount: 120, taker: 128, createdAt: 160, expiresAt: 168, bump: 176 };

export interface Offer {
  address: string;
  maker: string;
  id: bigint;
  giveMint: string;
  giveAmount: bigint;
  wantMint: string;
  wantAmount: bigint;
  /** null = open to anyone */
  taker: string | null;
  createdAt: number;
  expiresAt: number;
}

export const delegatePda = () => PublicKey.findProgramAddressSync([enc.encode("delegate")], PROGRAM_ID)[0];

export function offerPda(maker: PublicKey, id: bigint) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, id, true);
  return PublicKey.findProgramAddressSync([enc.encode("offer"), maker.toBytes(), b], PROGRAM_ID)[0];
}

const pk = (d: Uint8Array, o: number) => new PublicKey(d.slice(o, o + 32)).toBase58();
const u64 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset).getBigUint64(o, true);
const i64 = (d: Uint8Array, o: number) => Number(new DataView(d.buffer, d.byteOffset).getBigInt64(o, true));

export function decodeOffer(address: string, data: Uint8Array): Offer | null {
  if (data.length < OFFER_SIZE || !OFFER_DISC.every((b, i) => data[i] === b)) return null;
  const taker = pk(data, OFF.taker);
  return {
    address,
    maker: pk(data, OFF.maker),
    id: u64(data, OFF.id),
    giveMint: pk(data, OFF.giveMint),
    giveAmount: u64(data, OFF.giveAmount),
    wantMint: pk(data, OFF.wantMint),
    wantAmount: u64(data, OFF.wantAmount),
    taker: taker === PublicKey.default.toBase58() ? null : taker,
    createdAt: i64(data, OFF.createdAt),
    expiresAt: i64(data, OFF.expiresAt),
  };
}

export async function fetchOffer(conn: Connection, address: string): Promise<Offer | null> {
  const info = await conn.getAccountInfo(new PublicKey(address));
  if (!info || !info.owner.equals(PROGRAM_ID)) return null;
  return decodeOffer(address, info.data);
}

export async function fetchOffers(
  conn: Connection,
  f: { maker?: string; giveMint?: string; wantMint?: string; taker?: string } = {},
): Promise<Offer[]> {
  const filters: GetProgramAccountsFilter[] = [
    { dataSize: OFFER_SIZE },
    { memcmp: { offset: 0, bytes: bs58.encode(OFFER_DISC) } },
  ];
  if (f.maker) filters.push({ memcmp: { offset: OFF.maker, bytes: f.maker } });
  if (f.giveMint) filters.push({ memcmp: { offset: OFF.giveMint, bytes: f.giveMint } });
  if (f.wantMint) filters.push({ memcmp: { offset: OFF.wantMint, bytes: f.wantMint } });
  if (f.taker) filters.push({ memcmp: { offset: OFF.taker, bytes: f.taker } });
  const accs = await conn.getProgramAccounts(PROGRAM_ID, { filters });
  return accs
    .map((a) => decodeOffer(a.pubkey.toBase58(), a.account.data))
    .filter((o): o is Offer => !!o)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------- mints

export interface MintMeta {
  decimals: number;
  tokenProgram: PublicKey;
}
const mintCache = new Map<string, MintMeta>();

export async function getMintMeta(conn: Connection, mint: string): Promise<MintMeta> {
  if (mint === NATIVE_MINT.toBase58()) return { decimals: 9, tokenProgram: TOKEN_PROGRAM_ID };
  const hit = mintCache.get(mint);
  if (hit) return hit;
  const info = await conn.getAccountInfo(new PublicKey(mint));
  if (!info) throw new Error(`Mint ${mint} not found on this cluster`);
  if (!info.owner.equals(TOKEN_PROGRAM_ID) && !info.owner.equals(TOKEN_2022_PROGRAM_ID))
    throw new Error("Not a token mint");
  const meta = { decimals: info.data[44], tokenProgram: info.owner };
  mintCache.set(mint, meta);
  return meta;
}

// ---------------------------------------------------------------- health

export type OfferStatus = "live" | "expired" | "unfunded";

/** Checks that each maker still holds the tokens and our delegate allowance is intact. */
export async function offerStatuses(conn: Connection, offers: Offer[]): Promise<Record<string, OfferStatus>> {
  const now = Date.now() / 1000;
  const out: Record<string, OfferStatus> = {};
  const delegate = delegatePda();
  const metas = await Promise.all(offers.map((o) => getMintMeta(conn, o.giveMint).catch(() => null)));
  const atas = offers.map((o, i) =>
    metas[i]
      ? getAssociatedTokenAddressSync(new PublicKey(o.giveMint), new PublicKey(o.maker), true, metas[i]!.tokenProgram)
      : PublicKey.default,
  );
  const infos: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>> = [];
  for (let i = 0; i < atas.length; i += 100) infos.push(...(await conn.getMultipleAccountsInfo(atas.slice(i, i + 100))));
  offers.forEach((o, i) => {
    if (o.expiresAt <= now) return (out[o.address] = "expired");
    const info = infos[i];
    if (!info || !metas[i]) return (out[o.address] = "unfunded");
    try {
      const acc = unpackAccount(atas[i], info, metas[i]!.tokenProgram);
      const ok = acc.delegate?.equals(delegate) && acc.delegatedAmount >= o.giveAmount && acc.amount >= o.giveAmount;
      out[o.address] = ok ? "live" : "unfunded";
    } catch {
      out[o.address] = "unfunded";
    }
  });
  return out;
}

// ---------------------------------------------------------------- builders

function u64le(v: bigint) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}
function i64le(v: bigint) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, v, true);
  return b;
}
function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return Buffer.from(out);
}
const w = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });

function withFee(tx: Transaction) {
  if (PRIORITY_FEE > 0) {
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
  }
  return tx;
}

async function finalize(conn: Connection, tx: Transaction, feePayer: PublicKey) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = feePayer;
  return tx;
}

export interface CreateParams {
  giveMint: string;
  giveAmount: bigint; // raw
  wantMint: string;
  wantAmount: bigint; // raw
  taker?: string | null;
  expiresAt: number; // unix seconds
}

export async function buildCreateOfferTx(conn: Connection, maker: PublicKey, p: CreateParams) {
  const giveMint = new PublicKey(p.giveMint);
  const wantMint = new PublicKey(p.wantMint);
  const { tokenProgram } = await getMintMeta(conn, p.giveMint);
  if (p.wantMint !== NATIVE_MINT.toBase58()) await getMintMeta(conn, p.wantMint); // validates mint exists

  const rand = crypto.getRandomValues(new Uint8Array(8));
  const id = new DataView(rand.buffer).getBigUint64(0, true);
  const offer = offerPda(maker, id);
  const makerGive = getAssociatedTokenAddressSync(giveMint, maker, true, tokenProgram);
  const tx = withFee(new Transaction());

  // Buy offers that pay in SOL: wrap the SOL so the delegate can move it.
  if (giveMint.equals(NATIVE_MINT)) {
    tx.add(createAssociatedTokenAccountIdempotentInstruction(maker, makerGive, maker, NATIVE_MINT));
    const bal = await conn.getTokenAccountBalance(makerGive).then((b) => BigInt(b.value.amount)).catch(() => 0n);
    let committed = 0n; // wSOL already promised to other open offers
    try {
      const info = await conn.getAccountInfo(makerGive);
      if (info) {
        const acc = unpackAccount(makerGive, info, TOKEN_PROGRAM_ID);
        if (acc.delegate?.equals(delegatePda())) committed = acc.delegatedAmount;
      }
    } catch {}
    const need = committed + p.giveAmount - bal;
    if (need > 0n) {
      tx.add(SystemProgram.transfer({ fromPubkey: maker, toPubkey: makerGive, lamports: need }));
      tx.add(createSyncNativeInstruction(makerGive));
    }
  }

  const taker = p.taker ? new PublicKey(p.taker) : PublicKey.default;
  tx.add(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        w(maker, true),
        w(offer),
        r(giveMint),
        r(wantMint),
        w(makerGive),
        r(delegatePda()),
        r(tokenProgram),
        r(SystemProgram.programId),
      ],
      data: concat(IX.createOffer, u64le(id), u64le(p.giveAmount), u64le(p.wantAmount), taker.toBytes(), i64le(BigInt(p.expiresAt))),
    }),
  );
  return { tx: await finalize(conn, tx, maker), offer: offer.toBase58() };
}

export async function buildTakeTx(conn: Connection, takerKey: PublicKey, o: Offer) {
  const maker = new PublicKey(o.maker);
  const giveMint = new PublicKey(o.giveMint);
  const wantMint = new PublicKey(o.wantMint);
  const give = await getMintMeta(conn, o.giveMint);
  const makerGive = getAssociatedTokenAddressSync(giveMint, maker, true, give.tokenProgram);
  const takerGive = getAssociatedTokenAddressSync(giveMint, takerKey, true, give.tokenProgram);
  const tx = withFee(new Transaction());

  if (wantMint.equals(NATIVE_MINT)) {
    tx.add(
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          w(takerKey, true),
          w(maker),
          w(new PublicKey(o.address)),
          r(giveMint),
          w(makerGive),
          w(takerGive),
          r(delegatePda()),
          r(give.tokenProgram),
          r(ASSOCIATED_TOKEN_PROGRAM_ID),
          r(SystemProgram.programId),
        ],
        data: Buffer.from(IX.takeOfferSol),
      }),
    );
  } else {
    const want = await getMintMeta(conn, o.wantMint);
    const takerWant = getAssociatedTokenAddressSync(wantMint, takerKey, true, want.tokenProgram);
    const makerWant = getAssociatedTokenAddressSync(wantMint, maker, true, want.tokenProgram);
    tx.add(
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          w(takerKey, true),
          w(maker),
          w(new PublicKey(o.address)),
          r(giveMint),
          r(wantMint),
          w(makerGive),
          w(takerGive),
          w(takerWant),
          w(makerWant),
          r(delegatePda()),
          r(give.tokenProgram),
          r(want.tokenProgram),
          r(ASSOCIATED_TOKEN_PROGRAM_ID),
          r(SystemProgram.programId),
        ],
        data: Buffer.from(IX.takeOfferToken),
      }),
    );
  }
  // Buy offers paid in SOL arrive as wSOL: unwrap straight back to SOL.
  if (giveMint.equals(NATIVE_MINT)) tx.add(createCloseAccountInstruction(takerGive, takerKey, takerKey));
  return finalize(conn, tx, takerKey);
}

export async function buildCancelTx(conn: Connection, makerKey: PublicKey, o: Offer) {
  const giveMint = new PublicKey(o.giveMint);
  const { tokenProgram } = await getMintMeta(conn, o.giveMint);
  const makerGive = getAssociatedTokenAddressSync(giveMint, makerKey, true, tokenProgram);
  const tx = withFee(new Transaction());
  const exists = await conn.getAccountInfo(makerGive);
  if (exists) {
    tx.add(
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [w(makerKey, true), w(new PublicKey(o.address)), r(giveMint), w(makerGive), r(delegatePda()), r(tokenProgram)],
        data: Buffer.from(IX.cancelOffer),
      }),
    );
  } else if (o.expiresAt <= Date.now() / 1000) {
    tx.add(closeExpiredIx(makerKey, o));
  } else {
    throw new Error("Your token account for this mint is closed; wait for expiry to reclaim rent.");
  }
  return finalize(conn, tx, makerKey);
}

export function closeExpiredIx(closer: PublicKey, o: Offer) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [{ pubkey: closer, isSigner: true, isWritable: false }, w(new PublicKey(o.maker)), w(new PublicKey(o.address))],
    data: Buffer.from(IX.closeExpired),
  });
}

// ---------------------------------------------------------------- events

export interface TakenEvent {
  kind: "taken";
  offer: string;
  maker: string;
  taker: string;
  giveMint: string;
  giveAmount: string;
  wantMint: string;
  wantAmount: string;
}
export interface CreatedEvent {
  kind: "created";
  offer: string;
  maker: string;
  giveMint: string;
  giveAmount: string;
  wantMint: string;
  wantAmount: string;
  taker: string | null;
}

/** Parse Anchor `emit!` events out of transaction logs. */
export function parseEvents(logs: string[]): (TakenEvent | CreatedEvent)[] {
  const out: (TakenEvent | CreatedEvent)[] = [];
  for (const l of logs) {
    if (!l.startsWith("Program data: ")) continue;
    const d = new Uint8Array(Buffer.from(l.slice(14), "base64"));
    const is = (x: Uint8Array) => x.every((b, i) => d[i] === b);
    if (is(EVENT_DISC.OfferTaken) && d.length >= 8 + 32 * 5 + 16) {
      out.push({
        kind: "taken",
        offer: pk(d, 8),
        maker: pk(d, 40),
        taker: pk(d, 72),
        giveMint: pk(d, 104),
        giveAmount: u64(d, 136).toString(),
        wantMint: pk(d, 144),
        wantAmount: u64(d, 176).toString(),
      });
    } else if (is(EVENT_DISC.OfferCreated) && d.length >= 8 + 32 * 5 + 24) {
      const t = pk(d, 144 + 8);
      out.push({
        kind: "created",
        offer: pk(d, 8),
        maker: pk(d, 40),
        giveMint: pk(d, 72),
        giveAmount: u64(d, 104).toString(),
        wantMint: pk(d, 112),
        wantAmount: u64(d, 144).toString(),
        taker: t === PublicKey.default.toBase58() ? null : t,
      });
    }
  }
  return out;
}
