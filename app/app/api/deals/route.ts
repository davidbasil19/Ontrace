import { NextRequest } from "next/server";
import { body, fail, guard, ok } from "@/lib/api";
import { createInstant, createListing, openDeals, toJSON } from "@/lib/dealServer";
import { authMessage, listingExtra, verifyWalletMessage, type DealTerms } from "@/lib/deals";

// GET /api/deals?maker=&taker=&mint=&status=live|all
export const GET = guard(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  let list = (await openDeals()).map(toJSON);
  const maker = q.get("maker"), taker = q.get("taker"), mint = q.get("mint"), buyer = q.get("buyer");
  if (maker) list = list.filter((d) => d.maker === maker);
  if (taker) list = list.filter((d) => d.taker === taker);
  if (buyer) list = list.filter((d) => d.requests.includes(buyer) || d.confirmed.includes(buyer));
  if (mint) list = list.filter((d) => d.giveMint === mint || d.wantMint === mint);
  if ((q.get("status") ?? "live") === "live") list = list.filter((d) => d.status === "live");
  return ok(list.sort((a, b) => b.createdAt - a.createdAt));
});

type CreateBody =
  | { kind: "instant"; terms: DealTerms; nonce: string; nonceValue: string; signedTx: string }
  | { kind: "request"; terms: DealTerms; ts: number; signature: string };

export const POST = guard(async (req: Request) => {
  const b = await body<CreateBody>(req);
  if (!b?.terms) return fail("Missing deal");
  if (b.kind === "instant") {
    const err = await createInstant(b.terms, b.nonce, b.nonceValue, b.signedTx);
    return err ? fail(err) : ok({ id: b.terms.id });
  }
  const msg = authMessage("list", b.terms.id, b.terms.maker, b.ts, listingExtra(b.terms));
  const bad = verifyWalletMessage(b.terms.maker, msg, b.signature, b.ts);
  if (bad) return fail(bad, 401);
  const err = await createListing(b.terms);
  return err ? fail(err) : ok({ id: b.terms.id });
});
