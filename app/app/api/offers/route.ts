import { NextRequest, NextResponse } from "next/server";
import { allOffers } from "@/lib/server";

// GET /api/offers?maker=&taker=&mint=&status=live|all
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const maker = q.get("maker"), taker = q.get("taker"), mint = q.get("mint");
  const status = q.get("status") ?? "live";
  const address = q.get("address");
  try {
    let list = await allOffers();
    if (address) list = list.filter((o) => o.address === address);
    if (maker) list = list.filter((o) => o.maker === maker);
    if (taker) list = list.filter((o) => o.taker === taker);
    if (mint) list = list.filter((o) => o.giveMint === mint || o.wantMint === mint);
    if (status === "live") list = list.filter((o) => o.status === "live");
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
