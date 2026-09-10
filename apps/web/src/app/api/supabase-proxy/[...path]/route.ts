import { NextRequest, NextResponse } from "next/server";

// 10 Sept 2026: transparent reverse proxy for the shared browser Supabase
// client (src/lib/supabase.ts) -- see that file's header comment for the
// full reasoning. Windows/corporate-network users were hitting
// net::ERR_QUIC_PROTOCOL_ERROR on EVERY direct browser -> <project>.
// supabase.co request (auth AND every workspace page's data reads/writes),
// not just the login flow's own calls that got fixed first. Rather than
// keep patching individual call sites, the browser client's URL now points
// here instead of at Supabase directly; this route forwards whatever comes
// in to the real Supabase URL server-side (Vercel's network, not the
// user's), byte for byte, and streams the response straight back.
//
// This app has no client-side Supabase Storage or Realtime usage (checked
// repo-wide before building this) -- only /auth/v1/* and /rest/v1/* ever
// need to flow through here. If that ever changes, Realtime specifically
// (a WebSocket upgrade) can't go through a plain Route Handler like this
// one and would need its own fix.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Every response here is per-user (RLS-scoped rows, auth tokens) -- must
// never be cached or statically optimized. Reading `req`'s own properties
// already makes Next.js treat this as dynamic automatically, but that's
// exactly the kind of implicit behavior not worth relying on for something
// where getting it wrong means one user's data served to another.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Headers that describe THIS hop's transport, not the one being proxied --
// forwarding them verbatim either makes no sense cross-hop (host) or
// actively corrupts the exchange (a stale content-length once the body's
// been re-read, or accept-encoding causing upstream to compress a body our
// own fetch() will already transparently decompress before we see it).
const SKIP_REQUEST_HEADERS = new Set(["host", "connection", "content-length", "accept-encoding"]);
const SKIP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

async function proxy(req: NextRequest, path: string[]) {
  if (!SUPABASE_URL) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const targetUrl = `${SUPABASE_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!SKIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
    });
  } catch {
    // The one failure mode this route can't route around: Vercel's own
    // network can't reach Supabase at all (a real outage, not the client's
    // local network issue this proxy exists to sidestep).
    return NextResponse.json({ error: "Failed to reach the database. Please try again." }, { status: 502 });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
