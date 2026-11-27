// Tiny key-value store: Upstash Redis in production (free tier via Vercel
// Storage), in-memory for local dev and tests.
import "server-only";
import { Redis } from "@upstash/redis";

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  lpush(key: string, value: unknown, keep: number): Promise<void>;
  lrange<T>(key: string, n: number): Promise<T[]>;
}

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function redisKV(r: Redis): KV {
  return {
    get: (k) => r.get(k),
    set: async (k, v) => void (await r.set(k, v)),
    sadd: async (k, m) => void (await r.sadd(k, m)),
    srem: async (k, m) => void (await r.srem(k, m)),
    smembers: (k) => r.smembers(k),
    lpush: async (k, v, keep) => {
      await r.lpush(k, v);
      await r.ltrim(k, 0, keep - 1);
    },
    lrange: (k, n) => r.lrange(k, 0, n - 1),
  };
}

function memoryKV(): KV {
  const g = globalThis as unknown as { __ontraceKV?: Map<string, unknown> };
  const m = (g.__ontraceKV ??= new Map());
  const clone = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));
  return {
    get: async <T>(k: string) => clone((m.get(k) as T) ?? null),
    set: async (k, v) => void m.set(k, clone(v)),
    sadd: async (k, x) => void m.set(k, [...new Set([...((m.get(k) as string[]) ?? []), x])]),
    srem: async (k, x) => void m.set(k, ((m.get(k) as string[]) ?? []).filter((y) => y !== x)),
    smembers: async (k) => [...((m.get(k) as string[]) ?? [])],
    lpush: async (k, v, keep) => void m.set(k, [clone(v), ...((m.get(k) as unknown[]) ?? [])].slice(0, keep)),
    lrange: async <T>(k: string, n: number) => clone(((m.get(k) as T[]) ?? []).slice(0, n)),
  };
}

export const kvConfigured = !!(url && token);
export const kv: KV = kvConfigured ? redisKV(new Redis({ url: url!, token: token! })) : memoryKV();

export function assertKV() {
  if (!kvConfigured && process.env.VERCEL)
    throw new Error("Database not connected. In Vercel: Storage → Upstash Redis → connect to this project, then redeploy.");
}
