import { NextResponse } from "next/server";
import { serverConn } from "@/lib/server";
import { PROGRAM_ID } from "@/lib/config";
import { parseEvents } from "@/lib/program";

let cache: { at: number; v: unknown } = { at: 0, v: [] };

export async function GET() {
  if (Date.now() - cache.at < 15_000) return NextResponse.json(cache.v);
  try {
    const sigs = await serverConn.getSignaturesForAddress(PROGRAM_ID, { limit: 25 });
    const ok = sigs.filter((s) => !s.err);
    const txs = await serverConn.getTransactions(ok.map((s) => s.signature), { maxSupportedTransactionVersion: 0 });
    const events = txs.flatMap((t, i) =>
      parseEvents(t?.meta?.logMessages ?? []).map((e) => ({ ...e, sig: ok[i].signature, time: ok[i].blockTime ?? 0 })),
    );
    cache = { at: Date.now(), v: events };
    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
