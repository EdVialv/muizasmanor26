import { cache } from "react";
import { fetchObjectBySlug, ObjectDetailQueryError, type ObjectDetail } from "@/lib/objects/detail";
import { createObjectDetailDataSourceFromEnv } from "@/lib/objects/supabaseDetailDataSource";
import { PublicDataConfigurationError } from "@/lib/supabase/publicClient";

export type LoadObjectOutcome =
  | { kind: "ok"; object: ObjectDetail }
  | { kind: "not_found" }
  | { kind: "configuration_error" }
  | { kind: "query_error" };

/**
 * Loads one published object by slug for both generateMetadata() and the
 * page itself. Wrapped in React's cache() so the two share a single
 * request-scoped lookup instead of querying twice.
 *
 * Failures are logged server-side and reduced to a kind: nothing from the
 * underlying error (a URL, a connection detail, a stack frame) is ever
 * returned to a caller that might render it.
 */
export const loadObject = cache(async (slug: string): Promise<LoadObjectOutcome> => {
  try {
    const dataSource = createObjectDetailDataSourceFromEnv();
    const object = await fetchObjectBySlug(dataSource, slug);
    return object ? { kind: "ok", object } : { kind: "not_found" };
  } catch (error) {
    if (error instanceof PublicDataConfigurationError) {
      console.error("[objects/slug] public data source is not configured:", error.message);
      return { kind: "configuration_error" };
    }
    if (error instanceof ObjectDetailQueryError) {
      console.error("[objects/slug] object query failed:", error.cause);
      return { kind: "query_error" };
    }
    console.error("[objects/slug] unexpected error loading the object:", error);
    return { kind: "query_error" };
  }
});
