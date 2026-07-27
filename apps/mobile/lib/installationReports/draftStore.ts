import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import type { DraftReport } from "./types";

/**
 * Local persistence for in-progress installation reports -- the whole point
 * of building drafts before fields (see plan section 3): close the app
 * mid-report and the draft must still be there.
 *
 * Native: one JSON file per draft under Paths.document/installation-drafts/
 * (document, not cache -- iOS evicts the cache directory under storage
 * pressure, which is exactly the data loss this feature exists to prevent).
 *
 * Web: expo-file-system's File/Directory/Paths API has no web backing at all
 * (unlike SecureStore, which at least degrades gracefully -- see the platform
 * branch in lib/supabase.ts). Since the web build here is a preview target,
 * not a shipped platform, drafts fall back to localStorage there so the
 * autosave/restart/submit flow can still be exercised in the web preview.
 * Every call in this module branches on Platform.OS === "web" for that reason.
 */

const DIR_NAME = "installation-drafts";
const WEB_PREFIX = "installation-draft:";

function draftsDir(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ idempotent: true });
  return dir;
}

function draftFile(id: string): File {
  return new File(draftsDir(), `${id}.json`);
}

export async function saveDraft(draft: DraftReport): Promise<void> {
  const withTimestamp: DraftReport = { ...draft, updatedAt: new Date().toISOString() };
  const json = JSON.stringify(withTimestamp);
  if (Platform.OS === "web") {
    localStorage.setItem(`${WEB_PREFIX}${draft.id}`, json);
    return;
  }
  const file = draftFile(draft.id);
  file.write(json);
}

export async function loadDraft(id: string): Promise<DraftReport | null> {
  if (Platform.OS === "web") {
    const raw = localStorage.getItem(`${WEB_PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as DraftReport) : null;
  }
  const file = draftFile(id);
  if (!file.exists) return null;
  return JSON.parse(file.textSync()) as DraftReport;
}

export async function deleteDraft(id: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(`${WEB_PREFIX}${id}`);
    return;
  }
  const file = draftFile(id);
  if (file.exists) file.delete();
  // Photos for this draft live under installation-drafts/<id>/photos/ -- see
  // photoStore.ts. Remove that directory too so a submitted report doesn't
  // leave its captured photos taking up device storage forever.
  const photoDir = new Directory(draftsDir(), id);
  if (photoDir.exists) photoDir.delete();
}

export async function listDrafts(): Promise<DraftReport[]> {
  if (Platform.OS === "web") {
    const drafts: DraftReport[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(WEB_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw) drafts.push(JSON.parse(raw) as DraftReport);
    }
    return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const dir = draftsDir();
  const drafts: DraftReport[] = [];
  for (const item of dir.list()) {
    if (item instanceof File && item.name.endsWith(".json")) {
      try {
        drafts.push(JSON.parse(item.textSync()) as DraftReport);
      } catch {
        // A corrupt draft file must not take down the whole list -- skip it.
      }
    }
  }
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
