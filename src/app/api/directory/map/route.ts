import { NextResponse, type NextRequest } from "next/server";
import { parseListing } from "@/lib/directory/filters";
import { fetchMapViewport } from "@/lib/map/mapQuery";
import { parseViewportParams } from "@/lib/map/viewport";
import {
  createPublicSupabaseClient,
  PublicDataConfigurationError,
} from "@/lib/supabase/publicClient";

/**
 * GET /api/directory/map?bbox=west,south,east,north&zoom=z&<listing params>
 * (docs/DAY19_MAP_NOTES.md).
 *
 * The listing parameters (q, type, region, access, service, condition,
 * ownership, family, family_unknown) are read with the directory's own
 * parseListing(), so the map applies exactly the list's search and
 * filters; `cursor` is ignored. The viewport is validated and clamped to
 * Latvia (an invalid one is a 400). The response is every matching object
 * in the viewport as a point, or grid clusters with exact counts - see
 * src/lib/map/mapQuery.ts.
 *
 * Read through the anon-key client. public_map_objects is SECURITY
 * INVOKER: points are read under RLS; cluster counts come from a SECURITY
 * DEFINER helper that aggregates published rows only (migration
 * 20261116090000, decision 5). Errors return a status and a generic body.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const viewport = parseViewportParams(params);
  if (!viewport) {
    return NextResponse.json({ error: "invalid_viewport" }, { status: 400 });
  }
  const { q, filters } = parseListing(params);
  try {
    const result = await fetchMapViewport(createPublicSupabaseClient(), viewport, { q, filters });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    if (error instanceof PublicDataConfigurationError) {
      console.error("[map] public data source is not configured:", error.message);
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    console.error("[map] viewport query failed:", error);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
