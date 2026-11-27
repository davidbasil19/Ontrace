"use client";
import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { useToast } from "@/components/Toast";
import { explorerTx } from "./config";
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
} from "./deals";
import type { DealJSON } from "./dealServer";

type Slot = { index: number; address: string; exists: boolean; free: boolean; value: string | null; lamports: number; busyDeal: string | null };

async function api<T = { ok: true }>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init ? { ...init, headers: { "content-type": "application/json" } } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) throw new Error(d?.error || `Request failed (${r.status})`);
  return d as T;
}
const post = <T = { ok: true }>(url: string, body: unknown) => api<T>(url, { method: "POST", body: JSON.stringify(body) });
/** Simulate without touching the transaction (keeps signatures and the durable nonce intact). */
async function simulate(conn: Connection, tx: Transaction) {
  const v = VersionedTransaction.deserialize(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  const r = await conn.simulateTransaction(v, { sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed" });
  if (r.value.err) throw new Error(simError(r.value.logs, r.value.err));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface NewDeal {
  giveMint: string;
  giveAmount: bigint;
  wantMint: string;
  wantAmount: bigint;
  taker: string | null;
  expiresAt: number;
}

export function useDeals() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction, signMessage } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okText?: string): Promise<T | null> => {
      if (!publicKey) return toast("Connect a wallet first", "err"), null;
      setBusy(true);
      try {
        const r = await fn();
        if (okText) toast(okText, "ok");
        return r;
      } catch (e) {
        const m = (e as Error)?.message || "Something went wrong";
        toast(/reject|denied|cancel/i.test(m) ? "Cancelled in wallet" : m, "err");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [publicKey, toast],
  );

  /** Normal transaction where the connected wallet pays and signs. */
  const sendSimple = useCallback(
    async (tx: Transaction) => {
      await simulate(connection, tx);
      const sig = await sendTransaction(tx, connection, { skipPreflight: true });
      const res = await connection.confirmTransaction({ signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! }, "confirmed");
      if (res.value.err) throw new Error("Transaction failed");
      return sig;
    },
    [connection, sendTransaction],
  );

  const signText = useCallback(
    async (text: string) => {
      if (!signMessage) throw new Error("This wallet can't sign messages");
      return bs58.encode(await signMessage(new TextEncoder().encode(text)));
    },
    [signMessage],
  );

  /** A free deposit account (durable nonce), creating one if needed. */
  const freeNonce = useCallback(async () => {
    const me = publicKey!;
    const slots = await api<Slot[]>(`/api/nonces?maker=${me.toBase58()}`);
    const free = slots.find((s) => s.free && s.value);
    if (free) return { nonce: free.address, nonceValue: free.value! };
    const empty = slots.find((s) => !s.exists);
    if (!empty) throw new Error("All your deposit slots are in use. Cancel or finish an older deal first.");
    toast("Creating a reusable deposit account (one time, refundable)…", "info");
    await sendSimple(await buildCreateNonceTx(connection, me, empty.index));
    for (let i = 0; i < 20; i++) {
      const v = await readNonce(connection, empty.address).catch(() => null);
      if (v) return { nonce: empty.address, nonceValue: v };
      await sleep(800);
    }
    throw new Error("Deposit account not visible yet, try again");
  }, [publicKey, connection, sendSimple, toast]);

  /** Seller signs the swap for one buyer (instant deals and confirmations). */
  const signSwap = useCallback(
    async (terms: DealTerms, buyer: string, nonce: string, nonceValue: string) => {
      if (!signTransaction) throw new Error("This wallet can't sign transactions");
      const tx = await buildSwapTx(connection, { terms, buyer, nonce, nonceValue });
      const signed = await signTransaction(tx);
      return txToB64(signed);
    },
    [connection, signTransaction],
  );

  const create = useCallback(
    (d: NewDeal) =>
      run(async () => {
        const terms: DealTerms = {
          id: newDealId(),
          maker: publicKey!.toBase58(),
          giveMint: d.giveMint,
          giveAmount: d.giveAmount.toString(),
          wantMint: d.wantMint,
          wantAmount: d.wantAmount.toString(),
          taker: d.taker,
          createdAt: Math.floor(Date.now() / 1000),
          expiresAt: d.expiresAt,
        };
        if (terms.taker) {
          const { nonce, nonceValue } = await freeNonce();
          const signedTx = await signSwap(terms, terms.taker, nonce, nonceValue);
          await post("/api/deals", { kind: "instant", terms, nonce, nonceValue, signedTx });
        } else {
          const ts = Math.floor(Date.now() / 1000);
          const signature = await signText(authMessage("list", terms.id, terms.maker, ts, listingExtra(terms)));
          await post("/api/deals", { kind: "request", terms, ts, signature });
        }
        return terms.id;
      }, "Deal is live. Share the link!"),
    [run, publicKey, freeNonce, signSwap, signText],
  );

  const request = useCallback(
    (deal: DealJSON) =>
      run(async () => {
        const buyer = publicKey!.toBase58();
        const ts = Math.floor(Date.now() / 1000);
        const signature = await signText(authMessage("request", deal.id, buyer, ts));
        await post(`/api/deals/${deal.id}/request`, { buyer, ts, signature });
      }, "Request sent. You'll be able to buy once the seller confirms."),
    [run, publicKey, signText],
  );

  const confirm = useCallback(
    (deal: DealJSON, buyer: string) =>
      run(async () => {
        let nonce = deal.nonce, nonceValue: string | null = null;
        if (nonce) nonceValue = await readNonce(connection, nonce);
        if (!nonce || !nonceValue) ({ nonce, nonceValue } = await freeNonce());
        const terms: DealTerms = { ...deal, taker: null };
        const signedTx = await signSwap(terms, buyer, nonce!, nonceValue!);
        await post(`/api/deals/${deal.id}/confirm`, { buyer, nonce, nonceValue, signedTx });
      }, "Confirmed. The buyer can now complete the deal."),
    [run, connection, freeNonce, signSwap],
  );

  const take = useCallback(
    (deal: DealJSON) =>
      run(async () => {
        if (!signTransaction) throw new Error("This wallet can't sign transactions");
        const me = publicKey!.toBase58();
        const { tx: b64 } = await api<{ tx: string }>(`/api/deals/${deal.id}/tx?account=${me}`);
        const tx = txFromB64(b64);
        await simulate(connection, tx);
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
        toast("Submitted…", "info", explorerTx(sig));
        for (let i = 0; i < 40; i++) {
          const st = (await connection.getSignatureStatuses([sig])).value[0];
          if (st?.err) throw new Error("Deal failed on-chain. Nothing moved.");
          if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") break;
          await sleep(1500);
        }
        await post(`/api/deals/${deal.id}/taken`, { sig }).catch(() => {});
        toast("Deal done! Check your wallet.", "ok", explorerTx(sig));
        return sig;
      }),
    [run, publicKey, signTransaction, connection, toast],
  );

  const cancel = useCallback(
    (deal: DealJSON) =>
      run(async () => {
        if (deal.nonce) {
          const cur = await readNonce(connection, deal.nonce);
          if (cur) await sendSimple(await buildCancelTx(connection, publicKey!, deal.nonce));
          for (let i = 0; i < 10; i++) {
            try {
              return await post(`/api/deals/${deal.id}/cancel`, {});
            } catch (e) {
              if (!/cancel transaction first/i.test((e as Error).message)) throw e;
              await sleep(1000);
            }
          }
          throw new Error("Cancelled on-chain; the site will update shortly");
        }
        const ts = Math.floor(Date.now() / 1000);
        const signature = await signText(authMessage("cancel", deal.id, deal.maker, ts));
        return post(`/api/deals/${deal.id}/cancel`, { ts, signature });
      }, "Deal cancelled."),
    [run, connection, publicKey, sendSimple, signText],
  );

  const reclaim = useCallback(
    () =>
      run(async () => {
        const slots = await api<Slot[]>(`/api/nonces?maker=${publicKey!.toBase58()}`);
        const free = slots.filter((s) => s.free);
        if (!free.length) throw new Error("No free deposits to reclaim");
        await sendSimple(await buildReclaimTx(connection, publicKey!, free));
        return free.reduce((n, s) => n + s.lamports, 0) / 1e9;
      }),
    [run, publicKey, connection, sendSimple],
  );

  const deposits = useCallback(async (wallet: PublicKey) => api<Slot[]>(`/api/nonces?maker=${wallet.toBase58()}`), []);

  return { busy, create, request, confirm, take, cancel, reclaim, deposits };
}

function simError(logs: string[] | null | undefined, err: unknown) {
  const l = (logs ?? []).join("\n");
  if (/insufficient lamports|insufficient funds/i.test(l)) return "Not enough SOL or tokens to complete this deal";
  if (/BlockhashNotFound|nonce/i.test(JSON.stringify(err))) return "This deal is no longer valid (taken or cancelled)";
  return `Simulation failed: ${JSON.stringify(err)}`;
}
