export type OfferStatus = "live" | "expired" | "unfunded";

/** Public shape of a deal used across the UI, Blinks and share images. */
export interface OfferJSON {
  address: string;
  maker: string;
  id: string;
  giveMint: string;
  giveAmount: string;
  wantMint: string;
  wantAmount: string;
  taker: string | null;
  createdAt: number;
  expiresAt: number;
  status?: OfferStatus;
}
