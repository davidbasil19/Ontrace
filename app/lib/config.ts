import { clusterApiUrl } from "@solana/web3.js";

export type Cluster = "devnet" | "mainnet-beta";
export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER ?? "devnet") as Cluster;

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(CLUSTER);
/** Server-side RPC (keep paid keys out of the browser bundle if you like). */
export const SERVER_RPC_URL = process.env.SOLANA_RPC_URL || RPC_URL;


export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Optional priority fee in micro-lamports per CU (0 = none). */
export const PRIORITY_FEE = Number(process.env.NEXT_PUBLIC_PRIORITY_FEE ?? (CLUSTER === "devnet" ? 0 : 20000));

export const NATIVE_MINT_STR = "So11111111111111111111111111111111111111112";
export const USDC_MINT_STR =
  CLUSTER === "devnet"
    ? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" // Circle devnet USDC
    : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const PAYMENT_ASSETS = [
  { mint: NATIVE_MINT_STR, symbol: "SOL" },
  { mint: USDC_MINT_STR, symbol: "USDC" },
];

export const EXPIRY_OPTIONS = [
  { label: "5m", secs: 5 * 60 },
  { label: "30m", secs: 30 * 60 },
  { label: "1h", secs: 60 * 60 },
  { label: "4h", secs: 4 * 60 * 60 },
  { label: "24h", secs: 24 * 60 * 60 },
  { label: "3d", secs: 3 * 24 * 60 * 60 },
  { label: "7d", secs: 7 * 24 * 60 * 60 },
];

export const explorerTx = (sig: string) =>
  `https://solscan.io/tx/${sig}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerAccount = (a: string) =>
  `https://solscan.io/account/${a}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;
