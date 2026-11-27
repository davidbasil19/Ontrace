"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import OffersBoard from "@/components/OffersBoard";
import { Requests } from "@/components/DealCard";
import type { DealJSON } from "@/lib/dealServer";
import { short } from "@/lib/format";
import { useJson } from "@/lib/hooks";
import { useDeals } from "@/lib/useDeals";

export default function MePage() {
  const { publicKey } = useWallet();
  if (!publicKey) return <div className="card p-8 text-center text-muted">Connect your wallet to see your deals.</div>;
  return <Mine me={publicKey.toBase58()} />;
}

function Mine({ me }: { me: string }) {
  const mine = useJson<DealJSON[]>(`/api/deals?status=all&maker=${me}`, 15000);
  const { busy, confirm, reclaim, deposits } = useDeals();
  const { publicKey } = useWallet();
  const [dep, setDep] = useState<{ free: number; sol: number; busy: number } | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    deposits(publicKey)
      .then((s) => setDep({ free: s.filter((x) => x.free).length, sol: s.filter((x) => x.free).reduce((n, x) => n + x.lamports, 0) / 1e9, busy: s.filter((x) => x.busyDeal).length }))
      .catch(() => setDep(null));
  }, [publicKey, deposits, busy]);

  const withRequests = (mine.data ?? []).filter((d) => d.kind === "request" && d.requests.length > 0);

  return (
    <div className="space-y-6">
      {withRequests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Requests to confirm</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {withRequests.map((d) => (
              <div key={d.id}>
                <Link href={`/deal/${d.id}`} className="mb-2 block text-sm text-accent hover:underline">Deal {short(d.id, 5)} →</Link>
                <Requests deal={d} busy={busy} onConfirm={(b) => confirm(d, b).then(() => mine.reload())} />
              </div>
            ))}
          </div>
        </section>
      )}
      <OffersBoard query={`status=live&taker=${me}`} title="Private deals sent to you 🔒" empty="No private deals for you yet." />
      <OffersBoard query={`status=live&buyer=${me}`} title="Deals you requested" empty="You haven't requested any open deals." />
      <OffersBoard query={`status=all&maker=${me}`} title="Deals you made" empty="You haven't made any deals yet." />
      <section className="card flex flex-wrap items-center gap-4 p-5 text-sm">
        <div>
          <div className="font-bold">Deposits</div>
          <div className="text-muted">
            Private and confirmed deals use a small refundable deposit (~0.0015 SOL each) so signed deals stay valid. {dep ? `${dep.busy} in use, ${dep.free} free (${dep.sol.toFixed(4)} SOL).` : ""}
          </div>
        </div>
        <button className="btn-ghost ml-auto" disabled={busy || !dep?.free} onClick={() => reclaim().then(() => mine.reload())}>Reclaim free deposits</button>
      </section>
    </div>
  );
}
