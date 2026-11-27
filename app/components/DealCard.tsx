"use client";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { explorerTx } from "@/lib/config";
import { dealHeadline, dealSubline, dealView, type TokenLite } from "@/lib/deal";
import type { DealJSON } from "@/lib/dealServer";
import { fmtNum, fmtPct, short, timeAgo, timeLeft } from "@/lib/format";
import { useJson, useTokens } from "@/lib/hooks";
import { useDeals } from "@/lib/useDeals";
import { goodDeal, KindTag, SideTag } from "./OffersBoard";
import ShareBlink from "./ShareBlink";
import TokenBadge from "./TokenBadge";

export default function DealCard({ address, initial, isNew, autoRequest }: { address: string; initial: DealJSON | null; isNew?: boolean; autoRequest?: boolean }) {
  const { data, error, reload } = useJson<DealJSON>(`/api/deals/${address}`, 10000);
  const o = data ?? (error ? null : initial);
  const t = useTokens(o ? [o.giveMint, o.wantMint] : []);
  const { publicKey } = useWallet();
  const { busy, request, confirm, take, cancel } = useDeals();
  const me = publicKey?.toBase58();

  if (!o || o.state !== "open") {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-bold">{o?.state === "filled" ? "This deal was filled" : "This deal is closed"}</h1>
        <p className="mt-2 text-muted">
          {o?.state === "filled" ? "Both sides swapped in one transaction." : "It was taken, cancelled or has ended."}
          {o?.fillSig && (
            <a className="ml-1 text-accent underline" href={explorerTx(o.fillSig)} target="_blank" rel="noreferrer">View transaction</a>
          )}
        </p>
        <Link href="/" className="btn-accent mt-6">Browse open deals</Link>
      </div>
    );
  }

  const lite = (m: string): TokenLite => t[m] ?? { mint: m, symbol: short(m, 3), decimals: null, priceUsd: null };
  const v = dealView(o, lite(o.giveMint), lite(o.wantMint));
  const isMaker = me === o.maker;
  const status = o.status ?? "live";
  const live = status === "live";
  const after = () => setTimeout(reload, 800);
  const buyLabel = v.side === "SELL" ? `Buy for ${fmtNum(v.payAmount)} ${v.pay.symbol}` : `Sell ${fmtNum(v.tokenAmount)} ${v.token.symbol}`;

  let action: React.ReactNode;
  if (isMaker) {
    action = (
      <button className="btn-ghost w-full !py-3" disabled={busy} onClick={() => cancel(o).then((r) => r && after())}>
        {busy ? "Working…" : o.nonce ? "Cancel deal (1 small transaction)" : "Cancel listing (free)"}
      </button>
    );
  } else if (!publicKey) {
    action = <button className="btn-accent w-full !py-3" disabled>Connect wallet to take</button>;
  } else if (!live) {
    action = <button className="btn-accent w-full !py-3" disabled>{status === "expired" ? "Expired" : "Seller no longer has the tokens"}</button>;
  } else if (o.kind === "instant") {
    action =
      o.taker === me ? (
        <button className="btn-accent w-full !py-3" disabled={busy} onClick={() => take(o).then((r) => r && after())}>{busy ? "Signing…" : buyLabel}</button>
      ) : (
        <button className="btn-accent w-full !py-3" disabled>Private deal for another wallet</button>
      );
  } else if (o.confirmed.includes(me!)) {
    action = (
      <button className="btn-accent w-full !py-3" disabled={busy} onClick={() => take(o).then((r) => r && after())}>
        {busy ? "Signing…" : `Seller confirmed: ${buyLabel}`}
      </button>
    );
  } else if (o.requests.includes(me!)) {
    action = <button className="btn-ghost w-full !py-3" disabled>Requested. Waiting for the seller to confirm…</button>;
  } else {
    action = (
      <button className="btn-accent w-full !py-3" disabled={busy} onClick={() => request(o).then((r) => r !== null && after())}>
        {busy ? "Signing…" : "Request deal (free)"}
      </button>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[1.2fr_1fr]">
      <div className="card space-y-5 p-6">
        {isNew && <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm text-accent">Your deal is live. Share the Blink to get it filled →</div>}
        {autoRequest && !isMaker && o.kind === "request" && !o.requests.includes(me ?? "") && (
          <div className="rounded-xl border border-signal/30 bg-signal/5 p-3 text-sm text-signal">Open deal: tap “Request deal” below. Once the seller confirms, you can complete it.</div>
        )}
        <div className="flex items-center justify-between">
          <span className="flex gap-2"><SideTag side={v.side} /> <KindTag kind={o.kind} /></span>
          <span className={`text-xs font-bold ${live ? "text-up" : "text-down"}`}>● {status.toUpperCase()}</span>
        </div>
        <TokenBadge icon={v.token.icon} symbol={v.token.symbol} sub={v.token.name} size={48} />
        <div>
          <div className="text-4xl font-extrabold">{fmtNum(v.tokenAmount)} <span className="text-muted">${v.token.symbol}</span></div>
          <div className="mt-1 text-2xl">for <span className="font-bold text-signal">{fmtNum(v.payAmount)} {v.pay.symbol}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat k="Price" v={`${fmtNum(v.price, 10)} ${v.pay.symbol}`} />
          <Stat k="vs market" v={fmtPct(v.vsMarket)} tone={v.vsMarket == null ? "" : goodDeal(v.side, v.vsMarket) ? "text-up" : "text-down"} />
          <Stat k="Expires in" v={timeLeft(o.expiresAt)} />
          <Stat k="Counterparty" v={o.taker ? `🔒 ${short(o.taker)}` : "Anyone (seller confirms)"} />
          <Stat k="Seller" v={<Link className="hover:text-accent" href={`/wallet/${o.maker}`}>{short(o.maker, 6)}</Link>} />
          <Stat k="Deal ID" v={o.id} />
        </div>
        {action}
        {isMaker && status === "expired" && o.nonce && (
          <p className="text-xs text-down">This deal has expired. Cancel it to close it for good and free your deposit.</p>
        )}
        <p className="text-xs text-muted">The seller signed the exact swap, so the terms can’t be changed. Both sides move in one transaction, or nothing moves.</p>
      </div>
      <div className="space-y-5">
        {isMaker && o.kind === "request" && <Requests deal={o} busy={busy} onConfirm={(b) => confirm(o, b).then((r) => r !== null && after())} />}
        <ShareBlink address={o.id} text={`${dealHeadline(v)}\n${dealSubline(o, v)}`} privateFor={o.taker} />
        <Link href={`/token/${v.token.mint}`} className="card block p-5 text-sm hover:border-muted">See all ${v.token.symbol} offers and top holders →</Link>
      </div>
    </div>
  );
}

export function Requests({ deal, busy, onConfirm }: { deal: DealJSON; busy: boolean; onConfirm: (buyer: string) => void }) {
  return (
    <div className="card p-5">
      <h3 className="font-bold">Requests ({deal.requests.length})</h3>
      <p className="mt-1 text-sm text-muted">Confirm a buyer to sign the deal for them. If you confirm several, the first to complete it wins; the rest fail safely.</p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {!deal.requests.length && <li className="py-3 text-muted">No requests yet. Share your Blink to get some.</li>}
        {deal.requests.map((b) => (
          <li key={b} className="flex items-center gap-3 py-2">
            <Link href={`/wallet/${b}`} className="font-mono hover:text-accent">{short(b, 6)}</Link>
            {deal.confirmed.includes(b) ? (
              <span className="ml-auto text-xs font-bold text-up">Confirmed ✓ waiting for buyer</span>
            ) : (
              <button className="btn-accent ml-auto !py-1 text-xs" disabled={busy || deal.status !== "live"} onClick={() => onConfirm(b)}>Confirm</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const Stat = ({ k, v, tone = "" }: { k: string; v: React.ReactNode; tone?: string }) => (
  <div className="rounded-xl bg-paper p-3">
    <div className="text-xs text-muted">{k}</div>
    <div className={`truncate font-mono ${tone}`}>{v}</div>
  </div>
);
export { timeAgo };
