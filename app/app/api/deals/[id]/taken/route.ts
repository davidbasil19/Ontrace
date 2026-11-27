import { body, fail, guard, ok } from "@/lib/api";
import { getDeal, recordFill } from "@/lib/dealServer";

export const POST = guard(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ sig: string }>(req);
  const d = await getDeal(id);
  if (!d || !b?.sig) return fail("Deal not found", 404);
  const err = await recordFill(d, b.sig);
  return err ? fail(err) : ok();
});
