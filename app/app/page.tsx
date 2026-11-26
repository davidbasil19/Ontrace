import Link from "next/link";
import ActivityFeed from "@/components/ActivityFeed";
import MarketsTable from "@/components/MarketsTable";
import OffersBoard from "@/components/OffersBoard";
import { BRAND } from "@/lib/brand";

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="card flex flex-col gap-4 p-6 md:flex-row md:items-center">
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{BRAND.tagline}</h1>
          <p className="mt-2 max-w-2xl text-muted">{BRAND.pitch}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/create" className="btn-lime !px-6 !py-3">Create deal</Link>
          <Link href="#how" className="btn-ghost !px-6 !py-3">How it works</Link>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <OffersBoard />
          <MarketsTable />
        </div>
        <div className="space-y-6">
          <ActivityFeed />
          <section id="how" className="card space-y-3 p-5 text-sm">
            <h2 className="font-bold">How it works</h2>
            <Step n={1} t="Create a deal" d="Pick a token, amount, payment asset (SOL, USDC or any token), price and expiry. Open to all or locked to one wallet." />
            <Step n={2} t="Tokens stay with you" d="You approve the program to move only that amount. No escrow. Cancel any time." />
            <Step n={3} t="Share the Blink" d="Post the link on X or DM it. Takers fill it inside the post with their wallet." />
            <Step n={4} t="Atomic settlement" d="Both sides swap in one transaction, or nothing happens. 0% platform fee." />
          </section>
        </div>
      </div>
    </div>
  );
}
const Step = ({ n, t, d }: { n: number; t: string; d: string }) => (
  <div className="flex gap-3">
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime text-xs font-bold text-ink">{n}</span>
    <div><div className="font-semibold">{t}</div><div className="text-muted">{d}</div></div>
  </div>
);
