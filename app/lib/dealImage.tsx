import { ImageResponse } from "next/og";
import { BRAND } from "./brand";
import type { DealView } from "./deal";
import { fmtNum, fmtPct, short, timeLeft } from "./format";

const lime = "#B6FF3B";
export const OG_SIZE = { width: 1200, height: 1200 };

/** Deal card image used as the Blink icon and X/Twitter card. */
export function dealImage(v: DealView, offer: { expiresAt: number; taker: string | null }) {
  const size = OG_SIZE;
  const good = v.vsMarket != null && (v.side === "SELL" ? v.vsMarket < 0 : v.vsMarket > 0);
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0E0E10", color: "#F4F1EA", padding: 80, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: lime }}>{`${BRAND.name.toUpperCase()} OTC`}</div>
          <div style={{ display: "flex", fontSize: 36, padding: "10px 28px", borderRadius: 999, background: v.side === "SELL" ? "#3A1D1D" : "#173322", color: v.side === "SELL" ? "#FF8A8A" : "#7CF0A9" }}>
            {v.side === "SELL" ? "SELLING" : "BUYING"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 120, gap: 40 }}>
          {v.token.icon ? <img src={v.token.icon} width={160} height={160} style={{ borderRadius: 999 }} /> : <div style={{ display: "flex", width: 160, height: 160, borderRadius: 999, background: "#222", color: lime, fontSize: 56, alignItems: "center", justifyContent: "center" }}>{v.token.symbol.slice(0, 3)}</div>}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 110, fontWeight: 800 }}>{fmtNum(v.tokenAmount)}</div>
            <div style={{ display: "flex", fontSize: 64, color: "#B9B4A8" }}>{`$${v.token.symbol}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 72, marginTop: 70 }}>
          <span>for</span><span style={{ color: lime, fontWeight: 800, marginLeft: 20 }}>{`${fmtNum(v.payAmount)} ${v.pay.symbol}`}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 50, fontSize: 34 }}>
          {v.vsMarket != null && (
            <div style={{ display: "flex", padding: "14px 24px", borderRadius: 18, flexShrink: 0, background: good ? "#173322" : "#3A1D1D", color: good ? "#7CF0A9" : "#FF8A8A" }}>
              {`${fmtPct(v.vsMarket)} vs market`}
            </div>
          )}
          <div style={{ display: "flex", padding: "14px 24px", borderRadius: 18, flexShrink: 0, background: "#1C1C20" }}>{`Expires in ${timeLeft(offer.expiresAt)}`}</div>
          {offer.taker && <div style={{ display: "flex", padding: "14px 24px", borderRadius: 18, flexShrink: 0, background: "#1C1C20" }}>{`Private: ${short(offer.taker)}`}</div>}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 34, color: "#77736A" }}>No escrow · one atomic transaction · take it right here</div>
      </div>
    ),
    { ...size, headers: { "cache-control": "public, max-age=30" } },
  );
}
