import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getTokens, searchTokens } from "@/lib/market";
import { getDeal, serverConn } from "@/lib/dealServer";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });
  if (/^[1-9A-HJ-NP-Za-km-z]{12,24}$/.test(q) && (await getDeal(q).catch(() => null)))
    return NextResponse.json({ results: [{ type: "deal", address: q }] });
  let key: PublicKey | null = null;
  try { key = new PublicKey(q); } catch {}
  if (key) {
    const info = await serverConn.getAccountInfo(key).catch(() => null);
    const owner = info?.owner;
    if (owner && (owner.equals(TOKEN_PROGRAM_ID) || owner.equals(TOKEN_2022_PROGRAM_ID)) && info!.data.length >= 82)
      return NextResponse.json({ results: [{ type: "token", address: q, ...(await getTokens([q]))[q] }] });
    return NextResponse.json({ results: [{ type: "wallet", address: q }] });
  }
  const mints = await searchTokens(q);
  const t = await getTokens(mints);
  return NextResponse.json({ results: mints.map((m) => ({ type: "token", address: m, ...t[m] })) });
}
