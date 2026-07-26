import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Supabase client for React Native.
 *
 * Three deltas from src/lib/supabase.ts in the web app:
 *
 * 1. `react-native-url-polyfill/auto` must be the first import in the app.
 *    supabase-js uses the WHATWG URL API, which Hermes does not ship. Without
 *    it you get an opaque "URL.protocol is not implemented" at runtime.
 * 2. Session storage is expo-secure-store (Keychain) on native, not
 *    localStorage. Values are capped around 2KB per key; a Supabase session
 *    fits, but do not reuse this adapter for anything larger.
 * 3. detectSessionInUrl must be false. There is no URL bar to parse.
 *
 * SecureStore has no Node/web backing (per the SDK 57 docs: Android/iOS/tvOS
 * only, not SSR). expo-router's dev server renders every route once on Node
 * to validate its exports -- including this module, since documents.tsx and
 * the other tabs import it at module scope -- so calling into SecureStore
 * unconditionally crashes the whole `expo start` process, not just the web
 * bundle. `storage: undefined` on web/SSR lets supabase-js fall back to its
 * own safe default (localStorage in a real browser, an in-memory stub under
 * Node) instead.
 *
 * Row types (CustomerRow, JobOrderRow, DocumentRow, ApplelfgSiteSurveyRow, ...)
 * are NOT redefined here -- they move to packages/shared and both apps import
 * the same declarations. See MOBILE-PLAN.md.
 */

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: Platform.OS === "web" ? undefined : SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
