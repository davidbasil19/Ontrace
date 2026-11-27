import { body, fail, guard, ok } from "@/lib/api";
import { addRequest, getDeal } from "@/lib/dealServer";
import { authMessage, verifyWalletMessage } from "@/lib/deals";

export const POST = guard(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ buyer: string; ts: number; signature: string }>(req);
  if (!b?.buyer) return fail("Missing wallet");
  const bad = verifyWalletMessage(b.buyer, authMessage("request", id, b.buyer, b.ts), b.signature, b.ts);
  if (bad) return fail(bad, 401);
  const d = await getDeal(id);
  if (!d) return fail("Deal not found", 404);
  const err = await addRequest(d, b.buyer);
  return err ? fail(err) : ok();
});
