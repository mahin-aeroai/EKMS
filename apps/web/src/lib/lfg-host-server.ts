import { headers } from "next/headers";
import { LFG_HOST } from "./lfg-host";

/**
 * Server-Component counterpart to lfg-links.ts's useLfgHost() -- Context
 * doesn't reach Server Components, so any /lfg/* page that is itself a
 * Server Component and builds a Link href needs to read the request host
 * directly. Direct mirror of portal-host-server.ts -- kept in its own file
 * for the same reason (next/headers has no business being imported from
 * the Edge middleware, which only needs the bare LFG_HOST string).
 */
export async function getOnLfgHost(): Promise<boolean> {
  const hostHeader = (await headers()).get("host") ?? "";
  return hostHeader === LFG_HOST;
}
