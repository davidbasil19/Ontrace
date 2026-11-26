import { NextRequest, NextResponse } from "next/server";
import { getTokens } from "@/lib/market";

export async function GET(req: NextRequest) {
  const mints = (req.nextUrl.searchParams.get("mints") ?? "").split(",").filter(Boolean).slice(0, 100);
  return NextResponse.json(await getTokens(mints));
}
