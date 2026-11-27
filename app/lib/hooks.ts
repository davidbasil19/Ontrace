"use client";
import { useCallback, useEffect, useState } from "react";
import type { TokenInfo } from "./market";
import type { OfferJSON } from "./serialize";

export function useJson<T>(url: string | null, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then((r) => r.json())
      .then((d) => live && (d?.error ? setError(d.error) : (setData(d), setError(null))))
      .catch((e) => live && setError(String(e)));
    const id = pollMs ? setInterval(() => setTick((t) => t + 1), pollMs) : undefined;
    return () => {
      live = false;
      if (id) clearInterval(id);
    };
  }, [url, tick, pollMs]);
  return { data, error, reload, loading: !data && !error };
}

const tokenCache: Record<string, TokenInfo> = {};
export function useTokens(mints: string[]) {
  const key = [...new Set(mints.filter(Boolean))].sort().join(",");
  const [map, setMap] = useState<Record<string, TokenInfo>>(() => ({ ...tokenCache }));
  useEffect(() => {
    const missing = key.split(",").filter((m) => m && !tokenCache[m]);
    if (!missing.length) return setMap({ ...tokenCache });
    fetch(`/api/tokens?mints=${missing.join(",")}`)
      .then((r) => r.json())
      .then((d: Record<string, TokenInfo>) => {
        Object.assign(tokenCache, d);
        setMap({ ...tokenCache });
      })
      .catch(() => {});
  }, [key]);
  return map;
}

export const useOffers = (query: string, pollMs = 20000) => useJson<OfferJSON[]>(`/api/offers?${query}`, pollMs);
