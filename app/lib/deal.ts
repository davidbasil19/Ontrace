import { NATIVE_MINT_STR, USDC_MINT_STR } from "./config";
import { fmtNum, fmtPct, fromRaw, short, timeLeft } from "./format";
import type { OfferJSON } from "./serialize";

export interface TokenLite {
  mint: string;
  symbol: string;
  name?: string;
  icon?: string | null;
  decimals: number | null;
  priceUsd: number | null;
}

const PAY = new Set([NATIVE_MINT_STR, USDC_MINT_STR]);

export interface DealView {
  side: "SELL" | "BUY";
  token: TokenLite; // the asset being traded
  pay: TokenLite; // what it's priced in
  tokenAmount: number;
  payAmount: number;
  price: number; // pay per token
  vsMarket: number | null; // % vs market price
  giveUi: number;
  wantUi: number;
}

export function dealView(o: OfferJSON, give: TokenLite, want: TokenLite): DealView {
  const giveUi = fromRaw(o.giveAmount, give.decimals ?? 0);
  const wantUi = fromRaw(o.wantAmount, want.decimals ?? 0);
  const buy = PAY.has(o.giveMint) && !PAY.has(o.wantMint);
  const [token, pay, tokenAmount, payAmount] = buy ? [want, give, wantUi, giveUi] : [give, want, giveUi, wantUi];
  const price = tokenAmount > 0 ? payAmount / tokenAmount : 0;
  const market = token.priceUsd && pay.priceUsd ? token.priceUsd / pay.priceUsd : null;
  return {
    side: buy ? "BUY" : "SELL",
    token,
    pay,
    tokenAmount,
    payAmount,
    price,
    vsMarket: market ? (price / market - 1) * 100 : null,
    giveUi,
    wantUi,
  };
}

/** One-line human description, used by Blinks, OG cards and share text. */
export function dealHeadline(v: DealView) {
  const verb = v.side === "SELL" ? "Selling" : "Buying";
  return `${verb} ${fmtNum(v.tokenAmount)} $${v.token.symbol} for ${fmtNum(v.payAmount)} ${v.pay.symbol}`;
}

export function dealSubline(o: OfferJSON, v: DealView) {
  const parts = [`${fmtNum(v.price, 8)} ${v.pay.symbol} per token`];
  if (v.vsMarket != null) parts.push(`${fmtPct(v.vsMarket)} vs market`);
  parts.push(`expires in ${timeLeft(o.expiresAt)}`);
  if (o.taker) parts.push(`private for ${short(o.taker)}`);
  return parts.join(" · ");
}
