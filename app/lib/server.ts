import "server-only";
import { Connection } from "@solana/web3.js";
import { SERVER_RPC_URL } from "./config";
import { fetchOffers, offerStatuses } from "./program";
import { offerToJSON, type OfferJSON } from "./serialize";

export const serverConn = new Connection(SERVER_RPC_URL, "confirmed");

let all: { at: number; v: OfferJSON[] } = { at: 0, v: [] };

/** Every offer on the program with health status, cached for 10s. */
export async function allOffers(): Promise<OfferJSON[]> {
  if (Date.now() - all.at < 10_000) return all.v;
  const offers = await fetchOffers(serverConn);
  const st = await offerStatuses(serverConn, offers);
  all = { at: Date.now(), v: offers.map((o) => offerToJSON(o, st[o.address])) };
  return all.v;
}
