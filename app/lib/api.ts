import "server-only";
import { NextResponse } from "next/server";

export const ok = (data: unknown = { ok: true }) => NextResponse.json(data);
export const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
export async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
export function guard(fn: (...a: any[]) => Promise<Response>) {
  return async (...a: any[]) => {
    try {
      return await fn(...a);
    } catch (e) {
      return fail((e as Error).message || "Server error", 500);
    }
  };
}
