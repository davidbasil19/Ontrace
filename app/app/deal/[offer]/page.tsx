import type { Metadata } from "next";
import DealCard from "@/components/DealCard";
import { BRAND } from "@/lib/brand";
import { dealHeadline, dealSubline, dealView } from "@/lib/deal";
import { getTokens } from "@/lib/market";
import { fetchOffer, offerStatuses } from "@/lib/program";
import { offerToJSON } from "@/lib/serialize";
import { serverConn } from "@/lib/server";

type P = { params: Promise<{ offer: string }>; searchParams: Promise<{ new?: string }> };

async function load(address: string) {
  try {
    const o = await fetchOffer(serverConn, address);
    if (!o) return null;
    const st = await offerStatuses(serverConn, [o]);
    return offerToJSON(o, st[o.address]);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { offer } = await params;
  const o = await load(offer);
  if (!o) return { title: `Deal closed · ${BRAND.name}` };
  const t = await getTokens([o.giveMint, o.wantMint]);
  const v = dealView(o, t[o.giveMint], t[o.wantMint]);
  const title = `${dealHeadline(v)} · ${BRAND.product}`;
  const description = dealSubline(o, v);
  const images = [`/api/og/${offer}`];
  return { title, description, openGraph: { title, description, images }, twitter: { card: "summary_large_image", title, description, images } };
}

export default async function DealPage({ params, searchParams }: P) {
  const { offer } = await params;
  const { new: isNew } = await searchParams;
  return <DealCard address={offer} initial={await load(offer)} isNew={!!isNew} />;
}
