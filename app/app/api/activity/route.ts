import { guard, ok } from "@/lib/api";
import { listEvents } from "@/lib/dealServer";

export const GET = guard(async () => ok(await listEvents()));
