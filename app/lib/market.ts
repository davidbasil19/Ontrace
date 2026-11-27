// Server-only market data: DexScreener (prices, changes, volume, images)
// + on-chain metadata fallback (Metaplex) so devnet / unlisted tokens still get names.
import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT_STR, SERVER_RPC_URL, USDC_MINT_STR } from "./config";
import { getMintMeta } from "./deals";

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  icon: string | null;
  decimals: number | null;
  priceUsd: number | null;
  priceSol: number | null;
  change: { h1: number | null; h6: number | null; h24: number | null };
  volume24h: number | null;
  mcap: number | null;
  liquidity: number | null;
  dexUrl: string | null;
}

const DS = "https://api.dexscreener.com";
const conn = new Connection(SERVER_RPC_URL, "confirmed");
const cache = new Map<string, { at: number; v: TokenInfo }>();
const TTL = 30_000;

async function j<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 30 }, headers: { accept: "application/json" } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type Pair = {
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: Record<string, number>;
  volume?: Record<string, number>;
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  info?: { imageUrl?: string };
  url?: string;
};

let solPrice: { at: number; v: number | null } = { at: 0, v: null };
export async function getSolUsd(): Promise<number | null> {
  if (Date.now() - solPrice.at < TTL) return solPrice.v;
  const pairs = await j<Pair[]>(`${DS}/tokens/v1/solana/${NATIVE_MINT_STR}`);
  const best = pickBest(pairs ?? [], NATIVE_MINT_STR);
  solPrice = { at: Date.now(), v: best?.priceUsd ? Number(best.priceUsd) : null };
  return solPrice.v;
}

function pickBest(pairs: Pair[], mint: string) {
  return pairs
    .filter((p) => p.baseToken?.address === mint)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

const MPL = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
async function onchainMeta(mint: string): Promise<{ name: string; symbol: string } | null> {
  try {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("metadata"), MPL.toBuffer(), new PublicKey(mint).toBuffer()], MPL);
    const info = await conn.getAccountInfo(pda);
    if (!info) return null;
    const d = info.data;
    let o = 1 + 32 + 32;
    const str = () => {
      const len = d.readUInt32LE(o);
      o += 4;
      const s = d.subarray(o, o + len).toString("utf8").replace(/\0/g, "").trim();
      o += len;
      return s;
    };
    return { name: str(), symbol: str() };
  } catch {
    return null;
  }
}

export async function getTokens(mints: string[]): Promise<Record<string, TokenInfo>> {
  const uniq = [...new Set(mints.filter(Boolean))];
  const out: Record<string, TokenInfo> = {};
  const todo = uniq.filter((m) => {
    const c = cache.get(m);
    if (c && Date.now() - c.at < TTL) return !(out[m] = c.v);
    return true;
  });
  const sol = await getSolUsd();

  const pairsByMint: Record<string, Pair | undefined> = {};
  for (let i = 0; i < todo.length; i += 30) {
    const chunk = todo.slice(i, i + 30);
    const pairs = (await j<Pair[]>(`${DS}/tokens/v1/solana/${chunk.join(",")}`)) ?? [];
    for (const m of chunk) pairsByMint[m] = pickBest(pairs, m);
  }

  await Promise.all(
    todo.map(async (m) => {
      const p = pairsByMint[m];
      const decimals = await getMintMeta(conn, m).then((x) => x.decimals).catch(() => null);
      let name = p?.baseToken.name ?? "";
      let symbol = p?.baseToken.symbol ?? "";
      if (m === NATIVE_MINT_STR) (name = "Solana"), (symbol = "SOL");
      else if (m === USDC_MINT_STR) (name = "USD Coin"), (symbol = "USDC");
      if (!symbol) {
        const meta = await onchainMeta(m);
        name = meta?.name || "Unknown token";
        symbol = meta?.symbol || m.slice(0, 4);
      }
      const priceUsd = p?.priceUsd ? Number(p.priceUsd) : m === USDC_MINT_STR ? 1 : m === NATIVE_MINT_STR ? sol : null;
      const v: TokenInfo = {
        mint: m,
        name,
        symbol,
        icon: p?.info?.imageUrl ?? null,
        decimals,
        priceUsd,
        priceSol: priceUsd != null && sol ? priceUsd / sol : null,
        change: { h1: p?.priceChange?.h1 ?? null, h6: p?.priceChange?.h6 ?? null, h24: p?.priceChange?.h24 ?? null },
        volume24h: p?.volume?.h24 ?? null,
        mcap: p?.marketCap ?? p?.fdv ?? null,
        liquidity: p?.liquidity?.usd ?? null,
        dexUrl: p?.url ?? null,
      };
      cache.set(m, { at: Date.now(), v });
      out[m] = v;
    }),
  );
  return out;
}

/** Trending Solana tokens (DexScreener top boosts + latest profiles). */
export async function getTrending(limit = 30): Promise<string[]> {
  type B = { chainId: string; tokenAddress: string };
  const [top, latest] = await Promise.all([
    j<B[]>(`${DS}/token-boosts/top/v1`),
    j<B[]>(`${DS}/token-profiles/latest/v1`),
  ]);
  const mints = [...(top ?? []), ...(latest ?? [])].filter((b) => b.chainId === "solana").map((b) => b.tokenAddress);
  return [...new Set(mints)].slice(0, limit);
}

export async function searchTokens(q: string): Promise<string[]> {
  const res = await j<{ pairs?: (Pair & { chainId: string })[] }>(`${DS}/latest/dex/search?q=${encodeURIComponent(q)}`);
  const mints = (res?.pairs ?? []).filter((p) => p.chainId === "solana").map((p) => p.baseToken.address);
  return [...new Set(mints)].slice(0, 10);
}
