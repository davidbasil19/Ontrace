import { createActionHeaders, type ActionGetResponse, type ActionPostRequest, type ActionPostResponse } from "@solana/actions";
import { PublicKey } from "@solana/web3.js";
import { BRAND } from "@/lib/brand";
import { CLUSTER, SITE_URL } from "@/lib/config";
import { dealHeadline, dealSubline, dealView } from "@/lib/deal";
import { getDeal, refresh, toJSON, txFor } from "@/lib/dealServer";
import { getTokens } from "@/lib/market";

const headers = createActionHeaders({ chainId: CLUSTER === "devnet" ? "devnet" : "mainnet", actionVersion: "2.4" });
type Ctx = { params: Promise<{ offer: string }> };

async function load(id: string) {
  const rec = await getDeal(id);
  if (!rec) return null;
  const d = await refresh(rec);
  const json = toJSON(d);
  const t = await getTokens([d.giveMint, d.wantMint]);
  return { rec: d, json, v: dealView(json, t[d.giveMint], t[d.wantMint]) };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { offer: id } = await params;
  const x = await load(id).catch(() => null);
  if (!x || x.rec.state !== "open") {
    const body: ActionGetResponse = {
      type: "action",
      icon: `${SITE_URL}/logo.png`,
      title: BRAND.product,
      description: x?.rec.state === "filled" ? "This deal was filled." : "This deal was taken or cancelled.",
      label: "Deal closed",
      disabled: true,
    };
    return Response.json(body, { headers });
  }
  const { json, v, rec } = x;
  const live = json.status === "live";
  const label =
    rec.kind === "request"
      ? "Take deal"
      : v.side === "SELL"
        ? `Buy for ${+v.payAmount.toFixed(6)} ${v.pay.symbol}`
        : `Sell ${+v.tokenAmount.toFixed(6)} $${v.token.symbol}`;
  const how =
    rec.kind === "request"
      ? "Open deal: tap to request, the seller confirms, then you complete it."
      : "Private deal: only the named wallet can take it.";
  const body: ActionGetResponse = {
    type: "action",
    icon: `${SITE_URL}/api/og/${id}`,
    title: `${dealHeadline(v)} · ${BRAND.product}`,
    description: `${dealSubline(json, v)}. ${how} Settles wallet-to-wallet in one transaction, no escrow.`,
    label,
    disabled: !live,
    ...(!live && { error: { message: json.status === "expired" ? "This deal has expired." : "The seller no longer holds enough to cover it." } }),
    links: { actions: [{ type: "transaction", label, href: `/api/actions/take/${id}` }] },
  };
  return Response.json(body, { headers });
}

export const OPTIONS = async () => new Response(null, { headers });

export async function POST(req: Request, { params }: Ctx) {
  const { offer: id } = await params;
  try {
    const { account } = (await req.json()) as ActionPostRequest;
    const who = new PublicKey(account).toBase58();
    const x = await load(id);
    if (!x || x.rec.state !== "open") throw new Error("This deal is closed.");
    if (x.json.status !== "live") throw new Error(x.json.status === "expired" ? "This deal has expired." : "The seller no longer holds enough.");
    if (who === x.rec.maker) throw new Error("You can't take your own deal.");
    const tx = txFor(x.rec, who);
    if (tx) {
      // Seller already signed for this wallet: the wallet adds its signature and sends.
      const payload: ActionPostResponse = { type: "transaction", transaction: tx, message: `${dealHeadline(x.v)}. Deal done on ${BRAND.product}.` };
      return Response.json(payload, { headers });
    }
    if (x.rec.kind === "instant") throw new Error("This is a private deal for another wallet.");
    // Open deal, no confirmation yet: send them to request it.
    const payload: ActionPostResponse = { type: "external-link", externalLink: `${SITE_URL}/deal/${id}?request=1`, message: "Request this deal on OnTrace." };
    return Response.json(payload, { headers });
  } catch (e) {
    return Response.json({ message: (e as Error).message }, { status: 400, headers });
  }
}
