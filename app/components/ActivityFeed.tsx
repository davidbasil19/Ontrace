"use client";
import Link from "next/link";
import { useJson, useTokens } from "@/lib/hooks";
import { explorerTx } from "@/lib/config";
import { fmtNum, fromRaw, short, timeAgo } from "@/lib/format";
import type { DealEvent } from "@/lib/dealServer";

type E = DealEvent;

export default function ActivityFeed() {
  const { data } = useJson<E[]>("/api/activity", 20000);
  const ev = Array.isArray(data) ? data : [];
  const t = useTokens(ev.flatMap((e) => [e.giveMint, e.wantMint]));
  const amt = (m: string, raw: string) => `${fmtNum(fromRaw(raw, t[m]?.decimals ?? 0))} ${t[m]?.symbol ?? short(m, 3)}`;
  return (
    <section className="card">
      <h2 className="border-b border-line p-3 font-bold">Recent activity</h2>
      <ul className="max-h-[420px] divide-y divide-line overflow-y-auto text-sm">
        {!ev.length && <li className="p-4 text-muted">No activity yet.</li>}
        {ev.map((e) => (
          <li key={e.id + e.kind + e.time} className="flex items-start gap-2 p-3">
            <span className={`mt-0.5 rounded px-1.5 text-[10px] font-bold ${e.kind === "filled" ? "bg-up/15 text-up" : e.kind === "cancelled" ? "bg-line text-muted" : "bg-accent/15 text-accent"}`}>
              {e.kind === "filled" ? "FILLED" : e.kind === "cancelled" ? "CANCELLED" : "NEW"}
            </span>
            <span className="flex-1">
              {amt(e.giveMint, e.giveAmount)} ⇄ {amt(e.wantMint, e.wantAmount)}
              <span className="block text-xs text-muted">
                {short(e.maker)}
                {e.kind === "filled" && e.taker && <> → {short(e.taker)}</>} · {timeAgo(e.time)} ·{" "}
                {e.sig ? <a className="hover:text-accent" href={explorerTx(e.sig)} target="_blank" rel="noreferrer">tx</a> : <Link className="hover:text-accent" href={`/deal/${e.id}`}>deal</Link>}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
