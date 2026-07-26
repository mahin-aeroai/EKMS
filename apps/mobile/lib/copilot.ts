import { supabase } from "./supabase";

/**
 * Client for /api/ai-copilot.
 *
 * The route returns a single JSON object, not a stream:
 *
 *   { "content": "...", "citations": ["Site survey search: \"a\"", ...] }
 *
 * So plain fetch is correct here and expo/fetch is unnecessary. If the route
 * is ever converted to stream token-by-token, switch to
 * `import { fetch } from "expo/fetch"` -- React Native's global fetch is
 * XHR-backed and has no ReadableStream, so streaming silently degrades to one
 * lump at the end.
 *
 * Auth is a Bearer token, not a cookie. Verified working against the patched
 * routes: 401 without the header, 200 with it.
 */

export interface CopilotReply {
  content: string;
  citations: string[];
}

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return { Authorization: `Bearer ${token}` };
}

export async function askCopilot(
  messages: { role: "user" | "assistant"; content: string }[],
  signal?: AbortSignal
): Promise<CopilotReply> {
  const res = await fetch(`${API_BASE}/api/ai-copilot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (res.status === 401) throw new Error("Session expired");
  if (!res.ok) throw new Error(`Copilot returned ${res.status}`);

  const json = (await res.json()) as Partial<CopilotReply>;
  return { content: json.content ?? "", citations: json.citations ?? [] };
}

/**
 * Signed URL for a document, drawing, SOP or LFG survey PDF.
 *
 * 404 means the path was not found, which is a real answer -- do not retry.
 * 401 means the session lapsed; sign in again.
 */
export async function getSignedUrl(
  kind: "knowledge" | "survey",
  params: { table?: "documents" | "drawings" | "sops"; path: string }
): Promise<string> {
  const qs =
    kind === "knowledge"
      ? `table=${params.table ?? "documents"}&path=${encodeURIComponent(params.path)}`
      : `path=${encodeURIComponent(params.path)}`;

  const route = kind === "knowledge" ? "knowledge-files" : "lfg-surveys";

  const res = await fetch(`${API_BASE}/api/${route}/signed-url?${qs}`, {
    headers: await authHeader(),
  });

  if (res.status === 404) throw new Error("File not found");
  if (!res.ok) throw new Error(`Signed URL failed: ${res.status}`);

  const json = await res.json();
  return json.url ?? json.signedUrl;
}

/**
 * TODO on the server, not here.
 *
 * `citations` comes back as prose strings, so the app can only render the
 * answer as text. For tappable result cards -- open this survey, open this job
 * order -- the route needs to return the structured tool results alongside the
 * prose, e.g.
 *
 *   { content, citations, results: [{ tool, rows }] }
 *
 * Also worth fixing: find_site_survey's description tells the model to send
 * people to /workspaces/site-surveys, which it did in testing. On mobile there
 * is no URL to visit. Return relative_path in the result and drop that
 * sentence from the description.
 */
