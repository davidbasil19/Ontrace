"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { CLUSTER } from "@/lib/config";
import Search from "./Search";

const WalletButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton), { ssr: false });

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={32} height={32} />
          <span className="text-[22px] font-bold lowercase tracking-tight">{BRAND.name}</span>
          <span className="rounded bg-signal/15 px-1.5 py-0.5 text-[10px] font-bold text-signal">OTC</span>
          {CLUSTER === "devnet" && <span className="rounded bg-line px-1.5 py-0.5 text-[10px] font-bold text-accent">DEVNET</span>}
        </Link>
        <nav className="hidden gap-1 text-sm md:flex">
          <Link className="tab" href="/">Markets</Link>
          <Link className="tab" href="/create">Create deal</Link>
          <Link className="tab" href="/me">My deals</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Search />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
