import { NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { fail, guard, ok } from "@/lib/api";
import { nonceSlotsFor } from "@/lib/dealServer";

// A seller's reusable deposit accounts (durable nonces) and which are free.
export const GET = guard(async (req: NextRequest) => {
  const maker = req.nextUrl.searchParams.get("maker") ?? "";
  try {
    new PublicKey(maker);
  } catch {
    return fail("Bad wallet");
  }
  return ok(await nonceSlotsFor(maker));
});
