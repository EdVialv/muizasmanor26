"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  browseKey,
  buildBrowseHref,
  parseBrowseState,
  routeKey,
  type BrowseState,
} from "@/lib/directory/browseState";
import {
  canonicalFilters,
  listingKey,
  type DirectoryFilters,
  type DirectoryListing,
} from "@/lib/directory/filters";
import { normalizeSearchQuery } from "@/lib/directory/searchQuery";
import { normalizePosition, positionsEqual, type MapPosition } from "@/lib/map/position";

/** Which control started the navigation in flight - for its status message. */
export type ListingChangeSource = "search" | "filters";

interface DirectoryListingController {
  /**
   * The latest intended listing: the URL's, or - while a navigation of the
   * search field or the filter panel is in flight - the visitor's newest
   * choice. Always canonical (parseListing / canonicalFilters).
   */
  listing: DirectoryListing;
  /** The latest intended list cursor (validated for `listing`), or null for page 1. */
  cursor: string | null;
  /** The latest intended map position, or null for the default (all of Latvia). */
  position: MapPosition | null;
  /**
   * Changes whenever the state is taken from the URL instead of from a
   * control - Back/Forward, or a link such as "next page". Controls drop
   * their pending (debounced) changes when it changes, and pass the epoch
   * they started in to setQuery / setMapPosition, which ignore stale ones.
   */
  epoch: number;
  /** The canonical URL of the latest intended state in a view (path). */
  hrefFor: (pathname: string) => string;
  /**
   * Replaces the search query, keeping the latest intended filters and
   * position; the list goes back to page 1. Search commits made in one
   * typing burst share one history entry (see endSearchBurst).
   */
  setQuery: (query: string | null, options?: { epoch?: number }) => void;
  /** Ends the current typing burst: the next search commit adds a history entry. */
  endSearchBurst: () => void;
  /** Derives new filters from the latest intended ones, keeping the latest intended search. */
  updateFilters: (change: (current: DirectoryFilters) => DirectoryFilters) => void;
  /** Replaces search and filters together (e.g. "clear search and filters"). */
  setListing: (listing: DirectoryListing, source: ListingChangeSource) => void;
  /**
   * Records a map position the visitor moved to. Replaces the current
   * history entry (map moves never add entries); ignored when `epoch` is
   * not the current one (a move from before Back/Forward).
   */
  setMapPosition: (position: MapPosition | null, epoch: number) => void;
  isPending: boolean;
  /** The control whose change is in flight, or null. */
  pendingSource: ListingChangeSource | null;
}

const DirectoryListingContext = createContext<DirectoryListingController | null>(null);

/** Enough for any burst of changes made before the URL catches up. */
const MAX_REMEMBERED_URLS = 50;

function remember(list: string[], key: string): string[] {
  return list.includes(key) ? list : [...list, key].slice(-MAX_REMEMBERED_URLS);
}

function canonicalListing(listing: DirectoryListing): DirectoryListing {
  return { q: normalizeSearchQuery(listing.q), filters: canonicalFilters(listing.filters) };
}

/**
 * The one client-side owner of the directory's browse state: search,
 * filters, list cursor and map position (docs/DAY17_DIRECTORY_FILTERS_NOTES.md,
 * "Shared listing state", and docs/DAY20_URL_STATE_NOTES.md).
 *
 * Every control reads and changes one *intended* state here, never its own
 * URL snapshot:
 *
 * - Each change is derived from the latest intended state (kept in a ref,
 *   so changes in the same tick, or a debounced search firing after a
 *   filter change, build on each other).
 * - A search or filter change navigates to the canonical URL of the whole
 *   state with no cursor (page 1), keeping the map position. All such
 *   navigations share one transition; while one is in flight, the intended
 *   state is not reset from the URL.
 * - A map move only records the position; it is written to the URL with
 *   history.replaceState (a shallow update: no server request, no history
 *   entry), once nothing else is in flight.
 * - The provider remembers every URL it has written. When the URL settles
 *   on one of them but not on the newest state (an older navigation
 *   landing last, a position written before a newer move), that is not a
 *   visitor's choice: the newest state is kept and the URL corrected -
 *   router.replace() when listing or cursor differ, history.replaceState()
 *   when only the position does. The same step canonicalises a
 *   non-canonical URL (duplicates, unknown values, an invalid cursor or
 *   position). Each correction writes the canonical URL of the intended
 *   state, which is a fixed point, so it cannot loop.
 * - Any other URL change is the visitor's - Back/Forward (popstate) or a
 *   link - and the state follows the URL. Back/Forward wins even over a
 *   navigation still in flight (the App Router discards it), and moves the
 *   epoch on, so debounced search and map writes started before it are
 *   dropped.
 *
 * History: a filter change, a clear action, a view switch or a page link
 * adds an entry; a typing burst adds one entry for its first commit and
 * replaces it for the rest; map moves, canonicalisation and corrections
 * replace.
 */
export function DirectoryListingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const urlState = useMemo(() => parseBrowseState(new URLSearchParams(urlKey)).state, [urlKey]);

  const [intended, setIntended] = useState<BrowseState>(urlState);
  const [syncedUrlKey, setSyncedUrlKey] = useState(urlKey);
  // Query strings of every state this provider has intended (and so may
  // write to the URL) since the state was last taken from the URL.
  const [ownUrls, setOwnUrls] = useState<string[]>([]);
  // Set by Back/Forward: the URL the state must follow once it arrives
  // (`target`), and the URL shown when the event fired (`from`).
  const [followUrl, setFollowUrl] = useState<{ target: string; from: string } | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [pendingSource, setPendingSource] = useState<ListingChangeSource | null>(null);
  const [isPending, startTransition] = useTransition();

  const latestRef = useRef<BrowseState>(urlState);
  const epochRef = useRef(0);
  const followingRef = useRef(false);
  const urlKeyRef = useRef(urlKey);
  // URLs written by the current search typing burst; null when no burst.
  const searchBurstRef = useRef<string[] | null>(null);
  // The last URL correction made ("from -> to"): each is attempted once, so
  // a navigation that cannot change the URL can never loop.
  const lastCorrectionRef = useRef<string | null>(null);

  // Follow the URL (adjusting state during render, as React recommends
  // over an effect):
  // - after Back/Forward, once the URL is the restored one or has changed
  //   since the event - even while one of our navigations is in flight. (Not
  //   "differs from the last synced URL": a landing of ours not yet synced
  //   because a transition is still pending would then be adopted instead.)
  // - otherwise when nothing of ours is in flight and the URL is not one
  //   this provider wrote.
  const intendedKey = browseKey(intended);
  const follow = followUrl !== null && (urlKey === followUrl.target || urlKey !== followUrl.from);
  if (follow || (followUrl === null && !isPending && urlKey !== syncedUrlKey)) {
    setSyncedUrlKey(urlKey);
    if (follow || (urlKey !== intendedKey && !ownUrls.includes(urlKey))) {
      setFollowUrl(null);
      setIntended(urlState);
      setOwnUrls([]);
      setEpoch((value) => value + 1);
    }
  }

  // Keep the refs equal to the committed state (after a URL sync too).
  useLayoutEffect(() => {
    latestRef.current = intended;
    epochRef.current = epoch;
    followingRef.current = followUrl !== null;
    urlKeyRef.current = urlKey;
  }, [intended, epoch, followUrl, urlKey]);

  // Back/Forward. The App Router updates the URL state after this event;
  // pending writes are invalidated now.
  useEffect(() => {
    function onPopState() {
      followingRef.current = true;
      searchBurstRef.current = null;
      setFollowUrl({
        target: new URLSearchParams(window.location.search).toString(),
        from: urlKeyRef.current,
      });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Put the latest intended state in the URL when the URL has settled on
  // something else of ours, or is not canonical. (Its key is always "ours":
  // see the URL sync above.)
  const urlRouteKey = routeKey(urlState);
  useEffect(() => {
    if (isPending || followUrl !== null || syncedUrlKey !== urlKey || urlKey === intendedKey) {
      return;
    }
    const correction = `${urlKey}\n${intendedKey}`;
    if (lastCorrectionRef.current === correction) {
      return;
    }
    lastCorrectionRef.current = correction;
    const href = buildBrowseHref(pathname, intended);
    if (routeKey(intended) === urlRouteKey) {
      // Only the position differs, or the URL is not canonical: a shallow
      // update, no server request, no history entry.
      window.history.replaceState(null, "", href);
    } else if (ownUrls.includes(urlKey)) {
      // An older navigation of ours landed last.
      startTransition(() => router.replace(href, { scroll: false }));
    }
    // Otherwise the URL is still the one from before a navigation of ours,
    // which will change it.
  }, [
    isPending,
    followUrl,
    syncedUrlKey,
    urlKey,
    intendedKey,
    intended,
    urlRouteKey,
    ownUrls,
    pathname,
    router,
  ]);

  /** Navigates to a new listing (page 1); returns the URL key, or null when unchanged. */
  const navigate = useCallback(
    (
      listing: DirectoryListing,
      source: ListingChangeSource,
      history: "push" | "replace",
    ): string | null => {
      const latest = latestRef.current;
      const nextListing = canonicalListing(listing);
      if (listingKey(nextListing) === listingKey(latest.listing)) {
        return null;
      }
      const target: BrowseState = { listing: nextListing, cursor: null, position: latest.position };
      latestRef.current = target;
      setIntended(target);
      setPendingSource(source);
      const key = browseKey(target);
      setOwnUrls((previous) => remember(previous, key));
      const href = buildBrowseHref(pathname, target);
      startTransition(() =>
        history === "replace"
          ? router.replace(href, { scroll: false })
          : router.push(href, { scroll: false }),
      );
      return key;
    },
    [pathname, router],
  );

  const setQuery = useCallback(
    (query: string | null, options?: { epoch?: number }) => {
      if (
        options?.epoch !== undefined &&
        (options.epoch !== epochRef.current || followingRef.current)
      ) {
        return;
      }
      const burst = searchBurstRef.current;
      // Replace only once the burst's own entry is the current one;
      // otherwise (nothing of the burst has landed yet) push, which also
      // supersedes the burst's navigation still in flight.
      const replace = burst !== null && burst.includes(urlKeyRef.current);
      const key = navigate(
        { ...latestRef.current.listing, q: query },
        "search",
        replace ? "replace" : "push",
      );
      if (key !== null) {
        searchBurstRef.current = remember(burst ?? [], key);
      }
    },
    [navigate],
  );

  const setMapPosition = useCallback((position: MapPosition | null, atEpoch: number) => {
    if (atEpoch !== epochRef.current || followingRef.current) {
      return;
    }
    const next = position ? normalizePosition(position) : null;
    const latest = latestRef.current;
    if (positionsEqual(latest.position, next)) {
      return;
    }
    const target: BrowseState = { ...latest, position: next };
    latestRef.current = target;
    setIntended(target);
    setOwnUrls((previous) => remember(previous, browseKey(target)));
  }, []);

  const controller = useMemo<DirectoryListingController>(
    () => ({
      listing: intended.listing,
      cursor: intended.cursor,
      position: intended.position,
      epoch,
      hrefFor: (path) => buildBrowseHref(path, intended),
      setQuery,
      endSearchBurst: () => {
        searchBurstRef.current = null;
      },
      updateFilters: (change) => {
        searchBurstRef.current = null;
        const latest = latestRef.current.listing;
        navigate({ ...latest, filters: change(latest.filters) }, "filters", "push");
      },
      setListing: (listing, source) => {
        searchBurstRef.current = null;
        navigate(listing, source, "push");
      },
      setMapPosition,
      isPending,
      pendingSource: isPending ? pendingSource : null,
    }),
    [intended, epoch, setQuery, navigate, setMapPosition, isPending, pendingSource],
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
