import { body, fail, guard, ok } from "@/lib/api";
import { getDeal, markCancelled } from "@/lib/dealServer";
import { authMessage, verifyWalletMessage } from "@/lib/deals";

// Deals with a deposit account are cancelled on-chain first (advance nonce);
// listings without one are cancelled with a signed message.
export const POST = guard(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ ts?: number; signature?: string }>(req);
  const d = await getDeal(id);
  if (!d) return fail("Deal not found", 404);
  if (!d.nonce) {
    if (!b?.signature || !b.ts) return fail("Signature required", 401);
    const bad = verifyWalletMessage(d.maker, authMessage("cancel", id, d.maker, b.ts), b.signature, b.ts);
    if (bad) return fail(bad, 401);
  }
  const err = await markCancelled(d);
  return err ? fail(err) : ok();
});
