import { ImageResponse } from "next/og";
import { dealImage } from "@/lib/dealImage";
import { BRAND } from "@/lib/brand";
import { dealView } from "@/lib/deal";
import { getTokens } from "@/lib/market";
import { fetchOffer } from "@/lib/program";
import { offerToJSON } from "@/lib/serialize";
import { serverConn } from "@/lib/server";

// Deal card image used as the Blink icon and the X/Twitter card.
export async function GET(_req: Request, { params }: { params: Promise<{ offer: string }> }) {
  const { offer: address } = await params;
  const offer = await fetchOffer(serverConn, address).catch(() => null);
  const size = { width: 1200, height: 1200 };
  if (!offer) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#0E0E10", color: "#888", alignItems: "center", justifyContent: "center", fontSize: 64 }}>
          {`${BRAND.name} · deal closed`}
        </div>
      ),
      size,
    );
  }
  const json = offerToJSON(offer);
  const t = await getTokens([offer.giveMint, offer.wantMint]);
  const v = dealView(json, t[offer.giveMint], t[offer.wantMint]);
  return dealImage(v, offer);
}
