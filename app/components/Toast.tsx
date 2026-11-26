"use client";
import { createContext, useCallback, useContext, useState } from "react";

type T = { id: number; text: string; kind: "ok" | "err" | "info"; href?: string };
const Ctx = createContext<(text: string, kind?: T["kind"], href?: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((text: string, kind: T["kind"] = "info", href?: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind, href }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 7000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`card px-4 py-3 text-sm ${t.kind === "err" ? "border-down" : t.kind === "ok" ? "border-up" : ""}`}>
            {t.text}
            {t.href && (
              <a className="ml-2 text-lime underline" href={t.href} target="_blank" rel="noreferrer">view</a>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
