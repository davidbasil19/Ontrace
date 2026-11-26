"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import OffersBoard from "@/components/OffersBoard";

export default function MePage() {
  const { publicKey } = useWallet();
  if (!publicKey) return <div className="card p-8 text-center text-muted">Connect your wallet to see your deals.</div>;
  const me = publicKey.toBase58();
  return (
    <div className="space-y-6">
      <OffersBoard query={`status=live&taker=${me}`} title="Private deals sent to you 🔒" empty="No private deals for you yet." />
      <OffersBoard query={`status=all&maker=${me}`} title="Deals you made (open to cancel)" empty="You haven't made any deals yet." />
    </div>
  );
}
