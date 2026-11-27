import { NextRequest } from "next/server";
import { fail, guard, ok } from "@/lib/api";
import { getDeal, refresh, txFor } from "@/lib/dealServer";

// The seller-signed swap for one wallet. Only that wallet can complete it.
export const GET = guard(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const account = req.nextUrl.searchParams.get("account") ?? "";
  const d = await getDeal(id);
  if (!d) return fail("Deal not found", 404);
  await refresh(d, true);
  if (d.funded === false) return fail("The seller no longer holds enough to cover this deal");
  const tx = txFor(d, account);
  return tx ? ok({ tx }) : fail("No signed deal for this wallet yet", 404);
});
