import type { Offer, OfferStatus } from "./program";

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

export const offerToJSON = (o: Offer, status?: OfferStatus): OfferJSON => ({
  ...o,
  id: o.id.toString(),
  giveAmount: o.giveAmount.toString(),
  wantAmount: o.wantAmount.toString(),
  status,
});

export const offerFromJSON = (o: OfferJSON): Offer => ({
  ...o,
  id: BigInt(o.id),
  giveAmount: BigInt(o.giveAmount),
  wantAmount: BigInt(o.wantAmount),
});
