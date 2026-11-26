import { NextResponse } from "next/server";
import { getTokens, getTrending } from "@/lib/market";
import { allOffers } from "@/lib/server";
import { NATIVE_MINT_STR, USDC_MINT_STR } from "@/lib/config";

// Trending tokens + every token that currently has OTC offers, with OTC counts.
export async function GET() {
  const [trending, offers] = await Promise.all([getTrending(30), allOffers().catch(() => [])]);
  const otc: Record<string, number> = {};
  for (const o of offers.filter((o) => o.status === "live")) {
    for (const m of [o.giveMint, o.wantMint]) {
      if (m === NATIVE_MINT_STR || m === USDC_MINT_STR) continue;
      otc[m] = (otc[m] ?? 0) + 1;
    }
  }
  const mints = [...new Set([...Object.keys(otc), ...trending])];
  const tokens = await getTokens(mints);
  return NextResponse.json({
    tokens: mints.map((m) => ({ ...tokens[m], otc: otc[m] ?? 0, trending: trending.includes(m) })),
  });
}
