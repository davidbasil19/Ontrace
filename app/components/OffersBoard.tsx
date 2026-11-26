"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useOffers, useTokens } from "@/lib/hooks";
import { dealView, type TokenLite } from "@/lib/deal";
import { fmtNum, fmtPct, short, timeLeft } from "@/lib/format";
import type { OfferJSON } from "@/lib/serialize";
import TokenBadge from "./TokenBadge";

const lite = (m: string, t?: TokenLite): TokenLite => t ?? { mint: m, symbol: short(m, 3), decimals: null, priceUsd: null };

export default function OffersBoard({ query = "", title = "Active OTC offers", empty }: { query?: string; title?: string; empty?: React.ReactNode }) {
  const { data, loading, reload } = useOffers(query || "status=live");
  const offers = data ?? [];
  const tokens = useTokens(offers.flatMap((o) => [o.giveMint, o.wantMint]));
  const [side, setSide] = useState<"ALL" | "SELL" | "BUY">("ALL");
  const [sort, setSort] = useState<"new" | "deal" | "expiry">("new");

  const rows = useMemo(() => {
    const r = offers
      .map((o) => ({ o, v: dealView(o, lite(o.giveMint, tokens[o.giveMint]), lite(o.wantMint, tokens[o.wantMint])) }))
      .filter((x) => side === "ALL" || x.v.side === side);
    if (sort === "deal") r.sort((a, b) => score(a) - score(b));
    if (sort === "expiry") r.sort((a, b) => a.o.expiresAt - b.o.expiresAt);
    return r;
  }, [offers, tokens, side, sort]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <h2 className="mr-2 font-bold">{title}</h2>
        {(["ALL", "SELL", "BUY"] as const).map((s) => (
          <button key={s} className={`tab ${side === s ? "tab-on" : ""}`} onClick={() => setSide(s)}>{s === "ALL" ? "All" : s === "SELL" ? "Sells" : "Buys"}</button>
        ))}
        <select className="input ml-auto !w-auto !py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="new">Newest</option>
          <option value="deal">Best vs market</option>
          <option value="expiry">Ending soon</option>
        </select>
        <button className="tab" onClick={reload}>↻</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">vs mkt</th>
              <th className="px-3 py-2 text-right">Expires</th>
              <th className="px-3 py-2">Maker</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">Loading offers…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">{empty ?? "No open offers yet. Be the first."}</td></tr>}
            {rows.map(({ o, v }) => (
              <tr key={o.address} className="border-t border-line hover:bg-line/40">
                <td className="px-3 py-2"><SideTag side={v.side} /> {o.taker && <span title={`Private for ${o.taker}`}>🔒</span>}</td>
                <td className="px-3 py-2"><Link href={`/token/${v.token.mint}`}><TokenBadge icon={v.token.icon} symbol={v.token.symbol} size={22} /></Link></td>
                <td className="px-3 py-2 text-right font-mono">{fmtNum(v.tokenAmount)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtNum(v.price, 8)} {v.pay.symbol}</td>
                <td className={`px-3 py-2 text-right font-mono ${goodDeal(v.side, v.vsMarket) ? "text-up" : "text-down"}`}>{fmtPct(v.vsMarket)}</td>
                <td className="px-3 py-2 text-right font-mono text-muted">{timeLeft(o.expiresAt)}</td>
                <td className="px-3 py-2 font-mono text-xs"><Link href={`/wallet/${o.maker}`} className="hover:text-accent">{short(o.maker)}</Link></td>
                <td className="px-3 py-2 text-right"><Link className="btn-accent !py-1 text-xs" href={`/deal/${o.address}`}>{v.side === "SELL" ? "Buy" : "Sell"}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** For takers: a sell below market or a buy above market is a good deal. */
export const goodDeal = (side: "SELL" | "BUY", vs: number | null) => vs != null && (side === "SELL" ? vs <= 0 : vs >= 0);
const score = ({ v }: { v: ReturnType<typeof dealView> }) => (v.vsMarket == null ? 1e9 : v.side === "SELL" ? v.vsMarket : -v.vsMarket);
export const SideTag = ({ side }: { side: "SELL" | "BUY" }) => (
  <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${side === "SELL" ? "bg-down/15 text-down" : "bg-up/15 text-up"}`}>{side}</span>
);
export type { OfferJSON };
