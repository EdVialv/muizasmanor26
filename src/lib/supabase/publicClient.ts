/**
 * The one place server-side public pages build their Supabase client
 * (docs/DAY14_OBJECT_PAGES_NOTES.md).
 *
 * Always the anon/publishable-key client, never a direct Postgres
 * connection and never the secret key: every public read must pass through
 * the Day 9 Row Level Security policies, which are the real boundary
 * between a visitor and a draft record (docs/ARCHITECTURE.md). The
 * publishable key is safe to expose, but this module is still only imported
 * by server code - nothing here is bundled into client JS.
 *
 * The Day 13 directory keeps its own, reviewed copy of this env check in
 * src/lib/directory/supabaseDataSource.ts; this helper exists so the detail
 * page (and anything after it) does not add a third copy.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class PublicDataConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicDataConfigurationError";
  }
}

/**
 * Throws PublicDataConfigurationError when either variable is missing,
 * rather than returning a client that would fail later or a fake one: a
 * missing configuration is a real operational problem the page's error
 * state should surface.
 */
export function createPublicSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new PublicDataConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set to read public data.",
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
