import Link from "next/link";
import OffersBoard from "@/components/OffersBoard";
import TokenBadge from "@/components/TokenBadge";
import TopHolders from "@/components/TopHolders";
import { getTokens } from "@/lib/market";
import { fmtNum, fmtPct, fmtUsd } from "@/lib/format";

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const t = (await getTokens([mint]))[mint];
  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center gap-6 p-5">
        <TokenBadge icon={t?.icon} symbol={t?.symbol ?? "?"} sub={t?.name} size={48} />
        <Stat k="Price" v={t?.priceUsd ? `$${fmtNum(t.priceUsd, 8)}` : "—"} />
        <Stat k="24h" v={fmtPct(t?.change.h24)} />
        <Stat k="Mcap" v={fmtUsd(t?.mcap)} />
        <Stat k="Liquidity" v={fmtUsd(t?.liquidity)} />
        <Stat k="Vol 24h" v={fmtUsd(t?.volume24h)} />
        <div className="ml-auto flex gap-2">
          <Link className="btn-ghost" href={`/create?mint=${mint}&side=BUY`}>Post a buy</Link>
          <Link className="btn-lime" href={`/create?mint=${mint}`}>Post a sell</Link>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <OffersBoard query={`status=live&mint=${mint}`} title={`${t?.symbol ?? "Token"} offers`} />
        <TopHolders mint={mint} />
      </div>
    </div>
  );
}
const Stat = ({ k, v }: { k: string; v: string }) => (
  <div><div className="text-xs text-muted">{k}</div><div className="font-mono">{v}</div></div>
);
