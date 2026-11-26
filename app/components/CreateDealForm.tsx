"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { EXPIRY_OPTIONS, NATIVE_MINT_STR, PAYMENT_ASSETS } from "@/lib/config";
import { fmtNum, fmtPct, short, toRaw } from "@/lib/format";
import { useSendTx, useTokens } from "@/lib/hooks";
import { buildCreateOfferTx, getMintMeta } from "@/lib/program";
import TokenBadge from "./TokenBadge";

const isKey = (s: string) => {
  try {
    return !!new PublicKey(s.trim());
  } catch {
    return false;
  }
};

export default function CreateDealForm() {
  const sp = useSearchParams();
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { send, pending } = useSendTx();

  const [side, setSide] = useState<"SELL" | "BUY">((sp.get("side") as "BUY") === "BUY" ? "BUY" : "SELL");
  const [mint, setMint] = useState(sp.get("mint") ?? "");
  const [amount, setAmount] = useState("");
  const [payChoice, setPayChoice] = useState<string>(NATIVE_MINT_STR);
  const [otherMint, setOtherMint] = useState("");
  const [mode, setMode] = useState<"market" | "fixed">("market");
  const [pct, setPct] = useState(-5);
  const [fixed, setFixed] = useState("");
  const [cp, setCp] = useState<"open" | "wallet">(sp.get("taker") ? "wallet" : "open");
  const [taker, setTaker] = useState(sp.get("taker") ?? "");
  const [expiry, setExpiry] = useState(EXPIRY_OPTIONS[4].secs);
  const [balance, setBalance] = useState<number | null>(null);

  const payMint = payChoice === "other" ? otherMint.trim() : payChoice;
  const validMint = isKey(mint);
  const validPay = isKey(payMint);
  const t = useTokens([validMint ? mint.trim() : "", validPay ? payMint : ""]);
  const token = validMint ? t[mint.trim()] : undefined;
  const pay = validPay ? t[payMint] : undefined;
  const market = token?.priceUsd && pay?.priceUsd ? token.priceUsd / pay.priceUsd : null;

  const [touchedMode, setTouchedMode] = useState(false);
  useEffect(() => {
    if (!market && mode === "market") setMode("fixed");
    if (market && mode === "fixed" && !touchedMode) setMode("market");
  }, [market, mode, touchedMode]);

  // Balance of whatever the user is giving.
  const giveMint = side === "SELL" ? mint.trim() : payMint;
  useEffect(() => {
    setBalance(null);
    if (!publicKey || !isKey(giveMint)) return;
    (async () => {
      try {
        if (giveMint === NATIVE_MINT_STR) return setBalance((await connection.getBalance(publicKey)) / 1e9);
        const m = await getMintMeta(connection, giveMint);
        const ata = getAssociatedTokenAddressSync(new PublicKey(giveMint), publicKey, true, m.tokenProgram);
        const b = await connection.getTokenAccountBalance(ata);
        setBalance(b.value.uiAmount ?? 0);
      } catch {
        setBalance(0);
      }
    })();
  }, [publicKey, giveMint, connection]);

  const price = mode === "market" ? (market ? market * (1 + pct / 100) : 0) : Number(fixed) || 0;
  const tokenAmt = Number(amount) || 0;
  const payAmt = tokenAmt * price;
  const vs = market && price ? (price / market - 1) * 100 : null;

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!validMint) p.push("Pick a token");
    else if (token && token.decimals == null) p.push("Token not found on this cluster");
    if (!validPay) p.push("Pick a payment asset");
    if (validMint && mint.trim() === payMint) p.push("Token and payment must differ");
    if (!tokenAmt) p.push("Enter an amount");
    if (!price) p.push("Set a price");
    if (cp === "wallet" && !isKey(taker)) p.push("Enter a valid counterparty wallet");
    if (cp === "wallet" && publicKey && taker.trim() === publicKey.toBase58()) p.push("Counterparty can't be you");
    const need = side === "SELL" ? tokenAmt : payAmt;
    if (balance != null && need > balance) p.push(`Not enough balance (${fmtNum(balance)})`);
    return p;
  }, [validMint, validPay, token, mint, payMint, tokenAmt, price, cp, taker, publicKey, side, payAmt, balance]);

  async function submit() {
    if (!token || !pay || token.decimals == null || pay.decimals == null) return;
    const tokenRaw = toRaw(amount, token.decimals);
    const payRaw = toRaw(payAmt.toFixed(pay.decimals), pay.decimals);
    if (payRaw === 0n) return;
    let offer = "";
    const sig = await send(async () => {
      const r = await buildCreateOfferTx(connection, publicKey!, {
        giveMint: side === "SELL" ? token.mint : pay.mint,
        giveAmount: side === "SELL" ? tokenRaw : payRaw,
        wantMint: side === "SELL" ? pay.mint : token.mint,
        wantAmount: side === "SELL" ? payRaw : tokenRaw,
        taker: cp === "wallet" ? taker.trim() : null,
        expiresAt: Math.floor(Date.now() / 1000) + expiry,
      });
      offer = r.offer;
      return r.tx;
    }, "Deal is live. Share the link!");
    if (sig && offer) router.push(`/deal/${offer}?new=1`);
  }

  return (
    <div className="card mx-auto max-w-xl space-y-5 p-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-ink p-1">
        {(["SELL", "BUY"] as const).map((s) => (
          <button key={s} onClick={() => setSide(s)} className={`rounded-lg py-2 text-sm font-bold ${side === s ? (s === "SELL" ? "bg-down/20 text-down" : "bg-up/20 text-up") : "text-muted"}`}>
            {s === "SELL" ? "Sell tokens" : "Buy tokens"}
          </button>
        ))}
      </div>

      <Field label="Token">
        <input className="input font-mono" placeholder="Paste a token mint address" value={mint} onChange={(e) => setMint(e.target.value)} />
        {token && (
          <div className="mt-2 flex items-center justify-between text-sm">
            <TokenBadge icon={token.icon} symbol={token.symbol} sub={token.name} />
            <span className="text-muted">{token.priceUsd ? `$${fmtNum(token.priceUsd, 8)}` : "no market price"}</span>
          </div>
        )}
      </Field>

      <Field label={`Amount of ${token?.symbol ?? "tokens"} to ${side === "SELL" ? "sell" : "buy"}`} right={side === "SELL" && balance != null ? <button className="text-lime" onClick={() => setAmount(String(balance))}>MAX {fmtNum(balance)}</button> : null}>
        <input className="input font-mono" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
      </Field>

      <Field label="Payment asset">
        <div className="flex gap-2">
          {PAYMENT_ASSETS.map((a) => (
            <button key={a.mint} className={`tab border border-line ${payChoice === a.mint ? "tab-on" : ""}`} onClick={() => setPayChoice(a.mint)}>{a.symbol}</button>
          ))}
          <button className={`tab border border-line ${payChoice === "other" ? "tab-on" : ""}`} onClick={() => setPayChoice("other")}>Other</button>
        </div>
        {payChoice === "other" && <input className="input mt-2 font-mono" placeholder="Payment token mint" value={otherMint} onChange={(e) => setOtherMint(e.target.value)} />}
      </Field>

      <Field label="Price">
        <div className="mb-2 flex gap-2">
          <button disabled={!market} className={`tab border border-line ${mode === "market" ? "tab-on" : ""}`} onClick={() => (setMode("market"), setTouchedMode(true))}>% vs market</button>
          <button className={`tab border border-line ${mode === "fixed" ? "tab-on" : ""}`} onClick={() => (setMode("fixed"), setTouchedMode(true))}>Fixed price</button>
        </div>
        {mode === "market" ? (
          <div className="flex items-center gap-3">
            <input type="range" min={-50} max={50} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="flex-1 accent-[var(--color-lime)]" />
            <input className="input !w-20 text-right font-mono" value={pct} onChange={(e) => setPct(Number(e.target.value) || 0)} />
            <span className="text-sm text-muted">%</span>
          </div>
        ) : (
          <input className="input font-mono" inputMode="decimal" placeholder={`${pay?.symbol ?? ""} per token`} value={fixed} onChange={(e) => setFixed(e.target.value.replace(/[^\d.]/g, ""))} />
        )}
        <p className="mt-2 text-xs text-muted">
          {market ? `Market: ${fmtNum(market, 10)} ${pay?.symbol} per token. ` : "No market reference for this pair. "}
          Price is locked when you sign. Shorter expiries keep you close to market.
        </p>
      </Field>

      <Field label="Counterparty">
        <div className="flex gap-2">
          <button className={`tab border border-line ${cp === "open" ? "tab-on" : ""}`} onClick={() => setCp("open")}>Anyone</button>
          <button className={`tab border border-line ${cp === "wallet" ? "tab-on" : ""}`} onClick={() => setCp("wallet")}>Specific wallet 🔒</button>
        </div>
        {cp === "wallet" && <input className="input mt-2 font-mono" placeholder="Counterparty wallet address" value={taker} onChange={(e) => setTaker(e.target.value)} />}
      </Field>

      <Field label="Expires in">
        <div className="flex flex-wrap gap-2">
          {EXPIRY_OPTIONS.map((o) => (
            <button key={o.secs} className={`tab border border-line ${expiry === o.secs ? "tab-on" : ""}`} onClick={() => setExpiry(o.secs)}>{o.label}</button>
          ))}
        </div>
      </Field>

      <div className="rounded-xl bg-ink p-4 text-sm">
        <Row k="You give" v={side === "SELL" ? `${fmtNum(tokenAmt)} ${token?.symbol ?? ""}` : `${fmtNum(payAmt)} ${pay?.symbol ?? ""}`} />
        <Row k="You receive" v={side === "SELL" ? `${fmtNum(payAmt)} ${pay?.symbol ?? ""}` : `${fmtNum(tokenAmt)} ${token?.symbol ?? ""}`} />
        <Row k="Price" v={price ? `${fmtNum(price, 10)} ${pay?.symbol} / token` : "—"} />
        <Row k="vs market" v={fmtPct(vs)} />
        <Row k="Counterparty" v={cp === "open" ? "Anyone" : isKey(taker) ? short(taker.trim(), 6) : "—"} />
        <Row k="Platform fee" v="0% · network fee only" />
        <p className="mt-3 text-xs text-muted">Your tokens stay in your wallet. You approve this program to move only this amount, and only when someone takes the deal in one atomic transaction. Cancel any time.</p>
      </div>

      {problems.length > 0 && publicKey && <p className="text-xs text-down">{problems[0]}</p>}
      <button className="btn-lime w-full !py-3" disabled={!publicKey || problems.length > 0 || pending} onClick={submit}>
        {!publicKey ? "Connect wallet to create" : pending ? "Signing…" : "Create deal & get Blink link"}
      </button>
    </div>
  );
}

function Field({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs font-semibold text-muted">
        <span>{label}</span>
        {right}
      </div>
      {children}
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between py-0.5">
    <span className="text-muted">{k}</span>
    <span className="font-mono">{v}</span>
  </div>
);
