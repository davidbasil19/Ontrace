import { body, fail, guard, ok } from "@/lib/api";
import { confirmBuyer, getDeal } from "@/lib/dealServer";

// The seller-signed swap itself proves the seller confirmed.
export const POST = guard(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ buyer: string; nonce: string; nonceValue: string; signedTx: string }>(req);
  if (!b?.buyer || !b.signedTx) return fail("Missing confirmation");
  const d = await getDeal(id);
  if (!d) return fail("Deal not found", 404);
  const err = await confirmBuyer(d, b.buyer, b.nonce, b.nonceValue, b.signedTx);
  return err ? fail(err) : ok();
});
