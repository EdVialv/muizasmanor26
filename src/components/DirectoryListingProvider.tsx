"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  buildListingHref,
  canonicalFilters,
  listingKey,
  parseListing,
  type DirectoryFilters,
  type DirectoryListing,
} from "@/lib/directory/filters";
import { normalizeSearchQuery } from "@/lib/directory/searchQuery";

/** Which control started the navigation in flight - for its status message. */
export type ListingChangeSource = "search" | "filters";

interface DirectoryListingController {
  /**
   * The latest intended listing: the URL's, or - while a navigation of the
   * search field or the filter panel is in flight - the visitor's newest
   * choice. Always canonical (parseListing / canonicalFilters).
   */
  listing: DirectoryListing;
  /** Replaces the search query, keeping the latest intended filters. */
  setQuery: (query: string | null) => void;
  /** Derives new filters from the latest intended ones, keeping the latest intended search. */
  updateFilters: (change: (current: DirectoryFilters) => DirectoryFilters) => void;
  /** Replaces search and filters together (e.g. "clear search and filters"). */
  setListing: (listing: DirectoryListing, source: ListingChangeSource) => void;
  isPending: boolean;
  /** The control whose change is in flight, or null. */
  pendingSource: ListingChangeSource | null;
}

const DirectoryListingContext = createContext<DirectoryListingController | null>(null);

function canonical(listing: DirectoryListing): DirectoryListing {
  return { q: normalizeSearchQuery(listing.q), filters: canonicalFilters(listing.filters) };
}

/**
 * The one client-side owner of the directory's search-and-filter state
 * (docs/DAY17_DIRECTORY_FILTERS_NOTES.md, "Shared listing state").
 *
 * The search field and the filter panel used to build their URLs from their
 * own useSearchParams() snapshots, so a change in one could be built on a
 * URL that did not yet contain the other's newest change, and erase it.
 * Now both read and change one listing here:
 *
 * - Every change is derived from the latest *intended* listing (kept in a
 *   ref, so two changes in the same tick - or a debounced search firing
 *   after a filter change - still build on each other), never from the URL.
 * - Every change navigates to the canonical URL of the whole listing with
 *   no cursor: page 1.
 * - All navigations run in one shared transition. The App Router renders
 *   only the newest, and while any is in flight the intended listing is not
 *   reset from the URL - so an older, slower navigation landing first can
 *   never replace the newest state, in the controls or in the results.
 * - When the URL changes and nothing of ours is in flight (Back/Forward, a
 *   link, the settled newest navigation), the listing follows the URL.
 *
 * URL parsing stays in src/lib/directory/filters.ts; nothing is duplicated.
 */
export function DirectoryListingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const urlListing = useMemo(() => {
    const { q, filters } = parseListing(new URLSearchParams(urlKey));
    return { q, filters };
  }, [urlKey]);

  const [listing, setListingState] = useState<DirectoryListing>(urlListing);
  const [syncedUrlKey, setSyncedUrlKey] = useState(urlKey);
  const [pendingSource, setPendingSource] = useState<ListingChangeSource | null>(null);
  const [isPending, startTransition] = useTransition();
  const latestRef = useRef<DirectoryListing>(urlListing);

  // Follow the URL when it changes and none of our navigations is in flight
  // (adjusting state during render, as React recommends over an effect).
  if (!isPending && syncedUrlKey !== urlKey) {
    setSyncedUrlKey(urlKey);
    setListingState(urlListing);
  }

  // Keep the ref equal to the committed listing (after a URL sync too).
  useLayoutEffect(() => {
    latestRef.current = listing;
  }, [listing]);

  const navigate = useCallback(
    (next: DirectoryListing, source: ListingChangeSource) => {
      const target = canonical(next);
      if (listingKey(target) === listingKey(latestRef.current)) {
        return;
      }
      latestRef.current = target;
      setListingState(target);
      setPendingSource(source);
      startTransition(() => router.push(buildListingHref(pathname, target), { scroll: false }));
    },
    [pathname, router],
  );

  const controller = useMemo<DirectoryListingController>(
    () => ({
      listing,
      setQuery: (query) => navigate({ ...latestRef.current, q: query }, "search"),
      updateFilters: (change) =>
        navigate({ ...latestRef.current, filters: change(latestRef.current.filters) }, "filters"),
      setListing: navigate,
      isPending,
      pendingSource: isPending ? pendingSource : null,
    }),
    [listing, navigate, isPending, pendingSource],
  );

  return (
    <DirectoryListingContext.Provider value={controller}>
      {children}
    </DirectoryListingContext.Provider>
  );
}

export function useDirectoryListing(): DirectoryListingController {
  const controller = useContext(DirectoryListingContext);
  if (!controller) {
    throw new Error("useDirectoryListing() must be used inside <DirectoryListingProvider>.");
  }
  return controller;
}
