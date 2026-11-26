"use client";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { CLUSTER, SITE_URL } from "@/lib/config";

export default function ShareBlink({ address, text, privateFor }: { address: string; text: string; privateFor?: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const dealUrl = `${SITE_URL}/deal/${address}`;
  const actionUrl = `${SITE_URL}/api/actions/take/${address}`;
  const dialUrl = `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl}`)}${CLUSTER === "devnet" ? "&cluster=devnet" : ""}`;
  const tweet = `${text}\n\nTake it straight from this post 👇 via @${BRAND.x}`;
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(dealUrl)}`;
  const copy = (k: string, v: string) => navigator.clipboard.writeText(v).then(() => (setCopied(k), setTimeout(() => setCopied(null), 1500)));

  return (
    <div className="card space-y-3 p-5">
      <div>
        <h3 className="font-bold">Share as a Blink</h3>
        <p className="text-sm text-muted">
          {privateFor
            ? "DM this link to your counterparty. Only their wallet can take it, from X, Telegram or any Blink-enabled wallet."
            : "Post this on X. Anyone with Phantom, Backpack or the Dialect extension can take the deal right inside the post. No site visit needed."}
        </p>
      </div>
      <div className="flex gap-2">
        <input readOnly className="input font-mono text-xs" value={dealUrl} />
        <button className="btn-ghost" onClick={() => copy("link", dealUrl)}>{copied === "link" ? "Copied" : "Copy"}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn-lime" href={xUrl} target="_blank" rel="noreferrer">Post on X</a>
        <a className="btn-ghost" href={dialUrl} target="_blank" rel="noreferrer">Preview Blink</a>
        <button className="btn-ghost" onClick={() => copy("action", actionUrl)}>{copied === "action" ? "Copied" : "Copy Action URL"}</button>
      </div>
    </div>
  );
}
