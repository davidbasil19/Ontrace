export const short = (s: string, n = 4) => (s.length > 2 * n + 3 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

export function fromRaw(raw: bigint | string | number, decimals: number): number {
  return Number(BigInt(raw)) / 10 ** decimals;
}

/** Decimal string/number -> raw integer amount, without float drift. */
export function toRaw(ui: string | number, decimals: number): bigint {
  const s = typeof ui === "number" ? ui.toFixed(decimals) : ui.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") throw new Error("Invalid amount");
  const [i, f = ""] = s.split(".");
  return BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function fmtNum(n: number | null | undefined, max = 4): string {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1) + "K";
  if (a > 0 && a < 1e-4) return n.toExponential(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
}

export const fmtUsd = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : "$" + fmtNum(n, 2));

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function timeLeft(expiresAt: number, now = Date.now() / 1000): string {
  const s = Math.floor(expiresAt - now);
  if (s <= 0) return "expired";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function timeAgo(ts: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.floor(now - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
