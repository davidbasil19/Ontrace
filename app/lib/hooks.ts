"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Transaction } from "@solana/web3.js";
import type { TokenInfo } from "./market";
import type { OfferJSON } from "./serialize";
import { explorerTx } from "./config";
import { useToast } from "@/components/Toast";

export function useJson<T>(url: string | null, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then((r) => r.json())
      .then((d) => live && (d?.error ? setError(d.error) : (setData(d), setError(null))))
      .catch((e) => live && setError(String(e)));
    const id = pollMs ? setInterval(() => setTick((t) => t + 1), pollMs) : undefined;
    return () => {
      live = false;
      if (id) clearInterval(id);
    };
  }, [url, tick, pollMs]);
  return { data, error, reload, loading: !data && !error };
}

const tokenCache: Record<string, TokenInfo> = {};
export function useTokens(mints: string[]) {
  const key = [...new Set(mints.filter(Boolean))].sort().join(",");
  const [map, setMap] = useState<Record<string, TokenInfo>>(() => ({ ...tokenCache }));
  useEffect(() => {
    const missing = key.split(",").filter((m) => m && !tokenCache[m]);
    if (!missing.length) return setMap({ ...tokenCache });
    fetch(`/api/tokens?mints=${missing.join(",")}`)
      .then((r) => r.json())
      .then((d: Record<string, TokenInfo>) => {
        Object.assign(tokenCache, d);
        setMap({ ...tokenCache });
      })
      .catch(() => {});
  }, [key]);
  return map;
}

export const useOffers = (query: string, pollMs = 20000) => useJson<OfferJSON[]>(`/api/offers?${query}`, pollMs);

/** Sign, send and confirm a legacy transaction with toasts. */
export function useSendTx() {
  const { connection } = useConnection();
  const { sendTransaction, publicKey } = useWallet();
  const toast = useToast();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const send = useCallback(
    async (build: () => Promise<Transaction>, okText: string) => {
      if (!publicKey) return toast("Connect a wallet first", "err"), null;
      if (busy.current) return null;
      busy.current = true;
      setPending(true);
      try {
        const tx = await build();
        const sim = await connection.simulateTransaction(tx);
        if (sim.value.err) {
          const msg = sim.value.logs?.find((l) => l.includes("Error Message:"))?.split("Error Message:")[1];
          throw new Error(msg?.trim() || JSON.stringify(sim.value.err));
        }
        const sig = await sendTransaction(tx, connection, { skipPreflight: true });
        toast("Submitted…", "info", explorerTx(sig));
        const res = await connection.confirmTransaction(
          { signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! },
          "confirmed",
        );
        if (res.value.err) throw new Error("Transaction failed on-chain");
        toast(okText, "ok", explorerTx(sig));
        return sig;
      } catch (e) {
        toast((e as Error).message ?? "Transaction failed", "err");
        return null;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [connection, publicKey, sendTransaction, toast],
  );
  return { send, pending };
}
