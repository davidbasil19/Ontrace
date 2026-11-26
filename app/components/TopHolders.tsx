"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, type ParsedAccountData } from "@solana/web3.js";
import { fmtNum, short } from "@/lib/format";

type H = { owner: string; amount: number; pct: number };

export default function TopHolders({ mint }: { mint: string }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [rows, setRows] = useState<H[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = new PublicKey(mint);
        const [largest, supply] = await Promise.all([connection.getTokenLargestAccounts(m), connection.getTokenSupply(m)]);
        const accs = largest.value.slice(0, 20);
        const parsed = await connection.getMultipleParsedAccounts(accs.map((a) => a.address));
        const total = supply.value.uiAmount || 1;
        setRows(
          accs.map((a, i) => {
            const d = parsed.value[i]?.data as ParsedAccountData | undefined;
            return { owner: d?.parsed?.info?.owner ?? a.address.toBase58(), amount: a.uiAmount ?? 0, pct: ((a.uiAmount ?? 0) / total) * 100 };
          }),
        );
      } catch (e) {
        setErr("Holder data unavailable on this RPC");
      }
    })();
  }, [mint, connection]);

  return (
    <section className="card">
      <div className="border-b border-line p-3">
        <h2 className="font-bold">Top holders</h2>
        <p className="text-xs text-muted">Pitch a private deal straight to a whale. Only their wallet can take it.</p>
      </div>
      <ul className="divide-y divide-line text-sm">
        {err && <li className="p-4 text-muted">{err}</li>}
        {!rows && !err && <li className="p-4 text-muted">Loading on-chain holders…</li>}
        {rows?.map((h, i) => (
          <li key={h.owner + i} className="flex items-center gap-3 px-3 py-2">
            <span className="w-5 text-xs text-muted">{i + 1}</span>
            <Link href={`/wallet/${h.owner}`} className="font-mono text-xs hover:text-accent">{short(h.owner, 5)}</Link>
            <span className="ml-auto font-mono">{fmtNum(h.amount)}</span>
            <span className="w-14 text-right font-mono text-xs text-muted">{h.pct.toFixed(2)}%</span>
            {h.owner !== publicKey?.toBase58() && (
              <Link className="btn-ghost !px-2 !py-1 text-xs" href={`/create?mint=${mint}&taker=${h.owner}&side=BUY`}>Offer</Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
