import { NextResponse, type NextRequest } from "next/server";
import {
  fetchFamilyOptions,
  normalizeFamilySearch,
  type FamilyOptionsResult,
} from "@/lib/directory/familyOptions";
import {
  createPublicSupabaseClient,
  PublicDataConfigurationError,
} from "@/lib/supabase/publicClient";

/**
 * GET /api/directory/families?q=… - at most 20 verified historical-family
 * names matching q, with their published-object counts, for the directory's
 * family picker (docs/DAY18_CLASSIFICATION_FILTERS_NOTES.md).
 *
 * Read through the anon-key client, so Row Level Security applies; the
 * response holds only names and counts. Errors return a status and a
 * generic body - never the underlying message.
 */
export async function GET(request: NextRequest) {
  const search = normalizeFamilySearch(request.nextUrl.searchParams.get("q"));
  try {
    const result: FamilyOptionsResult = await fetchFamilyOptions(
      createPublicSupabaseClient(),
      search,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    if (error instanceof PublicDataConfigurationError) {
      console.error("[families] public data source is not configured:", error.message);
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    console.error("[families] family options could not be loaded:", error);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
