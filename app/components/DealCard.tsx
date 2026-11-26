"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { explorerAccount } from "@/lib/config";
import { dealHeadline, dealSubline, dealView, type TokenLite } from "@/lib/deal";
import { fmtNum, fmtPct, short, timeLeft } from "@/lib/format";
import { useJson, useSendTx, useTokens } from "@/lib/hooks";
import { buildCancelTx, buildTakeTx } from "@/lib/program";
import { offerFromJSON, type OfferJSON } from "@/lib/serialize";
import { goodDeal, SideTag } from "./OffersBoard";
import ShareBlink from "./ShareBlink";
import TokenBadge from "./TokenBadge";

export default function DealCard({ address, initial, isNew }: { address: string; initial: OfferJSON | null; isNew?: boolean }) {
  const { data } = useJson<OfferJSON[]>(`/api/offers?status=all&address=${address}`, 15000);
  const live = data ? data.find((o) => o.address === address) ?? null : initial;
  const o = live ?? initial;
  const t = useTokens(o ? [o.giveMint, o.wantMint] : []);
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { send, pending } = useSendTx();
  const router = useRouter();

  if (!o || (data && !live)) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-bold">This deal is closed</h1>
        <p className="mt-2 text-muted">It was taken, cancelled or cleaned up after expiry.</p>
        <Link href="/" className="btn-lime mt-6">Browse open deals</Link>
      </div>
    );
  }
  const lite = (m: string): TokenLite => t[m] ?? { mint: m, symbol: short(m, 3), decimals: null, priceUsd: null };
  const v = dealView(o, lite(o.giveMint), lite(o.wantMint));
  const me = publicKey?.toBase58();
  const isMaker = me === o.maker;
  const allowed = !o.taker || o.taker === me;
  const status = o.status ?? "live";

  const take = () => send(() => buildTakeTx(connection, publicKey!, offerFromJSON(o)), "Deal done! Tokens are in your wallet.").then((s) => s && router.refresh());
  const cancel = () => send(() => buildCancelTx(connection, publicKey!, offerFromJSON(o)), "Deal cancelled.").then((s) => s && router.push("/me"));

  return (
    <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[1.2fr_1fr]">
      <div className="card space-y-5 p-6">
        {isNew && <div className="rounded-xl border border-lime/40 bg-lime/10 p-3 text-sm text-lime">Your deal is live. Share the Blink to get it filled →</div>}
        <div className="flex items-center justify-between">
          <SideTag side={v.side} />
          <span className={`text-xs font-bold ${status === "live" ? "text-up" : "text-down"}`}>● {status.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-4">
          <TokenBadge icon={v.token.icon} symbol={v.token.symbol} sub={v.token.name} size={48} />
        </div>
        <div>
          <div className="text-4xl font-extrabold">{fmtNum(v.tokenAmount)} <span className="text-muted">${v.token.symbol}</span></div>
          <div className="mt-1 text-2xl">for <span className="font-bold text-lime">{fmtNum(v.payAmount)} {v.pay.symbol}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat k="Price" v={`${fmtNum(v.price, 10)} ${v.pay.symbol}`} />
          <Stat k="vs market" v={fmtPct(v.vsMarket)} tone={v.vsMarket == null ? "" : goodDeal(v.side, v.vsMarket) ? "text-up" : "text-down"} />
          <Stat k="Expires in" v={timeLeft(o.expiresAt)} />
          <Stat k="Counterparty" v={o.taker ? `🔒 ${short(o.taker)}` : "Anyone"} />
          <Stat k="Maker" v={<Link className="hover:text-lime" href={`/wallet/${o.maker}`}>{short(o.maker, 6)}</Link>} />
          <Stat k="Offer account" v={<a className="hover:text-lime" href={explorerAccount(o.address)} target="_blank" rel="noreferrer">{short(o.address, 6)}</a>} />
        </div>
        {isMaker ? (
          <button className="btn-ghost w-full !py-3" disabled={pending} onClick={cancel}>{pending ? "Cancelling…" : "Cancel deal"}</button>
        ) : (
          <button className="btn-lime w-full !py-3" disabled={!publicKey || !allowed || status !== "live" || pending} onClick={take}>
            {!publicKey
              ? "Connect wallet to take"
              : !allowed
                ? "Private deal for another wallet"
                : status !== "live"
                  ? status === "expired" ? "Expired" : "Maker no longer has the tokens"
                  : pending ? "Signing…" : v.side === "SELL" ? `Buy for ${fmtNum(v.payAmount)} ${v.pay.symbol}` : `Sell ${fmtNum(v.tokenAmount)} ${v.token.symbol}`}
          </button>
        )}
        <p className="text-xs text-muted">Both sides settle in one atomic transaction. If either side can't pay, nothing moves.</p>
      </div>
      <div className="space-y-5">
        <ShareBlink address={o.address} text={`${dealHeadline(v)}\n${dealSubline(o, v)}`} privateFor={o.taker} />
        <Link href={`/token/${v.token.mint}`} className="card block p-5 text-sm hover:border-muted">
          See all ${v.token.symbol} offers and top holders →
        </Link>
      </div>
    </div>
  );
}
const Stat = ({ k, v, tone = "" }: { k: string; v: React.ReactNode; tone?: string }) => (
  <div className="rounded-xl bg-ink p-3">
    <div className="text-xs text-muted">{k}</div>
    <div className={`font-mono ${tone}`}>{v}</div>
  </div>
);
