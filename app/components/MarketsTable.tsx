"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useJson } from "@/lib/hooks";
import type { TokenInfo } from "@/lib/market";
import { fmtPct, fmtUsd } from "@/lib/format";
import TokenBadge from "./TokenBadge";

type Row = TokenInfo & { otc: number; trending: boolean };
const TABS = ["Trending", "OTC active", "Gainers", "Losers"] as const;
const TF = ["h1", "h6", "h24"] as const;

export default function MarketsTable() {
  const { data, loading } = useJson<{ tokens: Row[] }>("/api/markets", 60000);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Trending");
  const [tf, setTf] = useState<(typeof TF)[number]>("h24");

  const rows = useMemo(() => {
    let r = (data?.tokens ?? []).filter((t) => t.mint);
    if (tab === "Trending") r = r.filter((t) => t.trending || t.otc);
    if (tab === "OTC active") r = r.filter((t) => t.otc > 0).sort((a, b) => b.otc - a.otc);
    if (tab === "Gainers") r = [...r].sort((a, b) => (b.change[tf] ?? -1e9) - (a.change[tf] ?? -1e9));
    if (tab === "Losers") r = [...r].sort((a, b) => (a.change[tf] ?? 1e9) - (b.change[tf] ?? 1e9));
    return r.slice(0, 25);
  }, [data, tab, tf]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <h2 className="mr-2 font-bold">Markets</h2>
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? "tab-on" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
        <div className="ml-auto flex gap-1">
          {TF.map((t) => (
            <button key={t} className={`tab ${tf === t ? "tab-on" : ""}`} onClick={() => setTf(t)}>{t.slice(1)}{t[0]}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">{tf.slice(1)}{tf[0]}</th>
              <th className="px-3 py-2 text-right">Vol 24h</th>
              <th className="px-3 py-2 text-right">Mcap</th>
              <th className="px-3 py-2 text-right">OTC</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Loading markets…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Nothing here yet.</td></tr>}
            {rows.map((t) => (
              <tr key={t.mint} className="border-t border-line hover:bg-line/40">
                <td className="px-3 py-2"><Link href={`/token/${t.mint}`}><TokenBadge icon={t.icon} symbol={t.symbol} sub={t.name} /></Link></td>
                <td className="px-3 py-2 text-right font-mono">{fmtUsd(t.priceUsd)}</td>
                <td className={`px-3 py-2 text-right font-mono ${(t.change[tf] ?? 0) >= 0 ? "text-up" : "text-down"}`}>{fmtPct(t.change[tf])}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtUsd(t.volume24h)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtUsd(t.mcap)}</td>
                <td className="px-3 py-2 text-right">{t.otc ? <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">{t.otc}</span> : <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2 text-right"><Link className="btn-ghost !py-1 text-xs" href={`/create?mint=${t.mint}`}>Deal</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
