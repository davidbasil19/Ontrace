import { fail, guard, ok } from "@/lib/api";
import { getDeal, refresh, toJSON } from "@/lib/dealServer";

export const GET = guard(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const d = await getDeal(id);
  return d ? ok(toJSON(await refresh(d))) : fail("Deal not found", 404);
});
