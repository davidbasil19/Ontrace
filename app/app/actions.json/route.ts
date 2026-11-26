import { ACTIONS_CORS_HEADERS, type ActionsJson } from "@solana/actions";

// Maps human deal URLs (yoursite/deal/<offer>) to the Action API, so a plain
// deal link pasted on X unfurls as a Blink for users with Blink-enabled wallets.
export const GET = () => {
  const payload: ActionsJson = {
    rules: [
      { pathPattern: "/deal/*", apiPath: "/api/actions/take/*" },
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
    ],
  };
  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
};
export const OPTIONS = GET;
