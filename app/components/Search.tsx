"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TokenBadge from "./TokenBadge";
import { short } from "@/lib/format";

type R = { type: "token" | "wallet" | "deal"; address: string; symbol?: string; name?: string; icon?: string | null };

export default function Search() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<R[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") (e.preventDefault(), ref.current?.focus());
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return setRes([]);
    const t = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => setRes(d.results ?? [])), 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (r: R) => {
    setOpen(false);
    setQ("");
    router.push(r.type === "token" ? `/token/${r.address}` : r.type === "deal" ? `/deal/${r.address}` : `/wallet/${r.address}`);
  };

  return (
    <div className="relative w-64 max-md:w-40">
      <input
        ref={ref}
        className="input pr-10"
        placeholder="Token, wallet or mint"
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => e.key === "Enter" && res[0] && go(res[0])}
      />
      <kbd className="pointer-events-none absolute right-2 top-2 rounded border border-line px-1 text-[10px] text-muted">⌘K</kbd>
      {open && res.length > 0 && (
        <div className="card absolute right-0 mt-2 w-80 overflow-hidden">
          {res.map((r) => (
            <button key={r.type + r.address} onMouseDown={() => go(r)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-line">
              {r.type === "token" ? (
                <TokenBadge icon={r.icon} symbol={r.symbol ?? "?"} sub={r.name} />
              ) : (
                <span><span className="text-muted">{r.type === "deal" ? "Deal" : "Wallet"}</span> {short(r.address, 6)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
