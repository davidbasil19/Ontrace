import {
  createActionHeaders,
  createPostResponse,
  type ActionGetResponse,
  type ActionPostRequest,
  type ActionPostResponse,
} from "@solana/actions";
import { PublicKey } from "@solana/web3.js";
import { BRAND } from "@/lib/brand";
import { CLUSTER, SITE_URL } from "@/lib/config";
import { dealHeadline, dealSubline, dealView } from "@/lib/deal";
import { getTokens } from "@/lib/market";
import { buildTakeTx, fetchOffer, offerStatuses } from "@/lib/program";
import { offerToJSON } from "@/lib/serialize";
import { serverConn } from "@/lib/server";

const headers = createActionHeaders({ chainId: CLUSTER === "devnet" ? "devnet" : "mainnet", actionVersion: "2.4" });
type Ctx = { params: Promise<{ offer: string }> };

async function load(address: string) {
  const offer = await fetchOffer(serverConn, address);
  if (!offer) return null;
  const status = (await offerStatuses(serverConn, [offer]))[offer.address];
  const json = offerToJSON(offer, status);
  const t = await getTokens([offer.giveMint, offer.wantMint]);
  const v = dealView(json, t[offer.giveMint], t[offer.wantMint]);
  return { offer, json, status, v };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { offer: address } = await params;
  const icon = `${SITE_URL}/api/og/${address}`;
  const d = await load(address).catch(() => null);
  if (!d) {
    const body: ActionGetResponse = {
      type: "action",
      icon: `${SITE_URL}/logo.png`,
      title: BRAND.product,
      description: "This deal was already taken or cancelled.",
      label: "Deal closed",
      disabled: true,
    };
    return Response.json(body, { headers });
  }
  const { json, status, v } = d;
  const label =
    v.side === "SELL" ? `Buy for ${+v.payAmount.toFixed(6)} ${v.pay.symbol}` : `Sell ${+v.tokenAmount.toFixed(6)} $${v.token.symbol}`;
  const body: ActionGetResponse = {
    type: "action",
    icon,
    title: `${dealHeadline(v)} · ${BRAND.product}`,
    description: `${dealSubline(json, v)}. Settles atomically wallet-to-wallet, no escrow.`,
    label,
    disabled: status !== "live",
    ...(status !== "live" && { error: { message: status === "expired" ? "This deal has expired." : "Maker no longer has the tokens." } }),
    links: { actions: [{ type: "transaction", label, href: `/api/actions/take/${address}` }] },
  };
  return Response.json(body, { headers });
}

export const OPTIONS = async () => new Response(null, { headers });

export async function POST(req: Request, { params }: Ctx) {
  const { offer: address } = await params;
  try {
    const body: ActionPostRequest = await req.json();
    const account = new PublicKey(body.account);
    const d = await load(address);
    if (!d) throw new Error("Deal not found — it may already be taken.");
    if (d.status !== "live") throw new Error(d.status === "expired" ? "This deal has expired." : "Maker no longer has the tokens.");
    if (d.offer.taker && d.offer.taker !== account.toBase58()) throw new Error("This is a private deal for another wallet.");
    if (d.offer.maker === account.toBase58()) throw new Error("You can't take your own deal.");
    const tx = await buildTakeTx(serverConn, account, d.offer);
    const payload: ActionPostResponse = await createPostResponse({
      fields: { type: "transaction", transaction: tx, message: `${dealHeadline(d.v)} — deal done on ${BRAND.product}.` },
    });
    return Response.json(payload, { headers });
  } catch (e) {
    return Response.json({ message: (e as Error).message }, { status: 400, headers });
  }
}
