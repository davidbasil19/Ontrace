import Link from "next/link";
import OffersBoard from "@/components/OffersBoard";
import { explorerAccount } from "@/lib/config";
import { short } from "@/lib/format";

export default async function WalletPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <div>
          <div className="text-xs text-muted">Wallet</div>
          <a className="font-mono hover:text-accent" href={explorerAccount(address)} target="_blank" rel="noreferrer">{short(address, 8)}</a>
        </div>
        <Link className="btn-accent ml-auto" href={`/create?taker=${address}`}>Send this wallet a private deal 🔒</Link>
      </section>
      <OffersBoard query={`status=live&maker=${address}`} title="Open offers by this wallet" />
    </div>
  );
}
