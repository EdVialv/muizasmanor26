import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useLayoutEffect, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Day 20 - the shared URL state (docs/DAY20_URL_STATE_NOTES.md), end to end
 * through the real provider, controls and map wrapper:
 *
 * - router navigations stay in flight until the test lands them (as in the
 *   Day 17 tests);
 * - history.replaceState is recorded, and the test decides when the App
 *   Router reflects it in useSearchParams() (applyReplace);
 * - Back/Forward is a popstate event followed by the App Router's URL update.
 */
const { router, navigation, mapProps } = vi.hoisted(() => {
  const inFlight: Array<{ href: string; settle: () => void }> = [];
  const pending = (href: string) =>
    new Promise<void>((resolve) => {
      inFlight.push({ href, settle: resolve });
    });
  return {
    navigation: { search: "", pathname: "/map" },
    router: { inFlight, push: vi.fn(pending), replace: vi.fn(pending) },
    mapProps: { current: null as null | Record<string, unknown> },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function LeafletStub(props: Record<string, unknown>) {
      mapProps.current = props;
      return <div data-testid="leaflet-stub" />;
    },
}));

import DirectoryCopyLink from "./DirectoryCopyLink";
import DirectoryFilterPanel from "./DirectoryFilterPanel";
import { DirectoryListingProvider, useDirectoryListing } from "./DirectoryListingProvider";
import DirectorySearchField, { SEARCH_DEBOUNCE_MS } from "./DirectorySearchField";
import DirectoryViewSwitch from "./DirectoryViewSwitch";
import DirectoryMap from "./map/DirectoryMap";
import { encodeCursor } from "@/lib/directory/cursor";
import { EMPTY_FILTERS, listingScope } from "@/lib/directory/filters";
import type { MapPosition } from "@/lib/map/position";

const TILES = {
  kind: "configured" as const,
  config: { urlTemplate: "https://t.example/{z}/{x}/{y}.png", attribution: "© T", maxZoom: 19 },
};

const probe: { current: ReturnType<typeof useDirectoryListing> | null } = { current: null };
function Probe() {
  const controller = useDirectoryListing();
  useLayoutEffect(() => {
    probe.current = controller;
  });
  return null;
}

function tree(): ReactElement {
  return (
    <DirectoryListingProvider>
      <Probe />
      <DirectoryViewSwitch />
      <DirectoryCopyLink />
      <DirectorySearchField />
      <DirectoryFilterPanel regionOptions={[]} />
      {navigation.pathname === "/map" ? <DirectoryMap tiles={TILES} /> : null}
    </DirectoryListingProvider>
  );
}

const P1: MapPosition = { lat: 56.95, lng: 24.1, zoom: 11 };
const P2: MapPosition = { lat: 57.31, lng: 25.27, zoom: 13 };
const P1_QUERY = "lat=56.95&lng=24.1&zoom=11";
const P2_QUERY = "lat=57.31&lng=25.27&zoom=13";

const originalReplaceState = window.history.replaceState.bind(window.history);
let replaced: string[] = [];

const searchInput = () =>
  screen.getByLabelText("Meklēt pēc nosaukuma vai vietas") as HTMLInputElement;
const box = (name: string) => screen.getByRole("checkbox", { name });
const pushed = () => router.push.mock.calls.map(([href]) => href as string);
const routerReplaced = () => router.replace.mock.calls.map(([href]) => href as string);

/** The App Router reflects the last history.replaceState() in useSearchParams(). */
function applyReplace(rerender: (ui: ReactElement) => void) {
  const href = replaced.at(-1);
  if (!href) {
    throw new Error("nothing was replaced");
  }
  navigation.search = new URL(href, "http://localhost").search.slice(1);
  act(() => rerender(tree()));
}

/** The URL becomes that navigation's target, then its transition settles. */
async function land(index: number, rerender: (ui: ReactElement) => void) {
  const navigationInFlight = router.inFlight[index];
  navigation.search = new URL(navigationInFlight.href, "http://localhost").search.slice(1);
  await act(async () => {
    rerender(tree());
    navigationInFlight.settle();
  });
}

/** Back/Forward: popstate, then the App Router shows the restored URL. */
function popState(search: string, rerender: (ui: ReactElement) => void) {
  originalReplaceState(null, "", `${navigation.pathname}${search ? `?${search}` : ""}`);
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  navigation.search = search;
  act(() => rerender(tree()));
}

function moveMap(position: MapPosition, epoch = probe.current!.epoch) {
  act(() => probe.current!.setMapPosition(position, epoch));
}

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  router.inFlight.length = 0;
  navigation.search = "";
  navigation.pathname = "/map";
  replaced = [];
  vi.spyOn(window.history, "replaceState").mockImplementation((_data, _unused, url) => {
    replaced.push(String(url));
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ mode: "objects", objects: [], clusters: [], total: 0 }),
    })),
  );
});

afterEach(async () => {
  await act(async () => {
    router.inFlight.forEach((navigationInFlight) => navigationInFlight.settle());
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("restoring a shared link", () => {
  it("restores search, filters and the map position before the map's first view", () => {
    navigation.search = `q=pils&type=manor_house&condition=unknown&family_unknown=1&${P1_QUERY}`;
    render(tree());

    expect(searchInput().value).toBe("pils");
    expect(box("Muižas kungu māja")).toBeChecked();
    expect(
      within(screen.getByRole("group", { name: "Stāvoklis" })).getByRole("checkbox", {
        name: /Nezināms/,
      }),
    ).toBeChecked();
    // The map is created with the URL's position: it opens there, and its
    // first data request is for that view - never for the default one.
    expect(mapProps.current?.position).toEqual(P1);
    // Already canonical: nothing is rewritten, nothing navigates.
    expect(replaced).toEqual([]);
    expect(pushed()).toEqual([]);
  });

  it("canonicalises a messy link once, in place, without a navigation or a loop", () => {
    navigation.search =
      "zoom=11&lng=24.1000&lat=56.950&type=manor_house&type=manor_house&q=%20pils%20" +
      "&cursor=not-a-cursor&type=spaceship";
    const { rerender } = render(tree());

    expect(replaced).toEqual([`/map?q=pils&type=manor_house&${P1_QUERY}`]);
    applyReplace(rerender);
    act(() => rerender(tree()));
    expect(replaced).toHaveLength(1);
    expect(pushed()).toEqual([]);
    expect(routerReplaced()).toEqual([]);
  });

  it("ignores a partial or out-of-range position and opens on Latvia", () => {
    navigation.search = "q=pils&lat=56.9&lng=24.1";
    render(tree());
    expect(mapProps.current?.position).toBeNull();
    expect(replaced).toEqual(["/map?q=pils"]);
  });
});

describe("map moves", () => {
  it("replace the URL (no history entry), keep search, filters and cursor, and never navigate", () => {
    const listing = { q: "pils", filters: EMPTY_FILTERS };
    const cursor = encodeCursor({
      name: "Jaunmoku pils",
      id: "11111111-2222-4333-8444-555555555555",
      scope: listingScope(listing),
    });
    navigation.search = `q=pils&cursor=${cursor}`;
    const { rerender } = render(tree());

    moveMap(P1);
    expect(replaced.at(-1)).toBe(`/map?q=pils&cursor=${cursor}&${P1_QUERY}`);
    applyReplace(rerender);
    moveMap(P2);
    expect(replaced.at(-1)).toBe(`/map?q=pils&cursor=${cursor}&${P2_QUERY}`);
    applyReplace(rerender);

    expect(pushed()).toEqual([]);
    expect(routerReplaced()).toEqual([]);
    // The view switch keeps both the list page and the map position.
    const views = screen.getByRole("navigation", { name: "Skats" });
    expect(within(views).getByRole("link", { name: "Saraksts" })).toHaveAttribute(
      "href",
      `/objects?q=pils&cursor=${cursor}&${P2_QUERY}`,
    );
  });

  it("a position written late never overrides a newer one (no feedback loop)", () => {
    const { rerender } = render(tree());
    moveMap(P1);
    moveMap(P2); // before the App Router has reflected P1
    expect(replaced).toEqual([`/map?${P1_QUERY}`, `/map?${P2_QUERY}`]);

    // P1 arrives late: it is ours, so the newest position is kept and put back.
    navigation.search = P1_QUERY;
    act(() => rerender(tree()));
    expect(probe.current?.position).toEqual(P2);
    expect(replaced.at(-1)).toBe(`/map?${P2_QUERY}`);
    applyReplace(rerender);
    const writes = replaced.length;
    act(() => rerender(tree()));
    expect(replaced).toHaveLength(writes);
    expect(mapProps.current?.positionEpoch).toBe(0); // never treated as Back/Forward
  });

  it("a move during a filter navigation is written once that navigation lands", async () => {
    navigation.search = "q=pils";
    const { rerender } = render(tree());

    fireEvent.click(box("Pils"));
    expect(pushed()).toEqual(["/map?q=pils&type=palace_or_castle"]);
    moveMap(P1);
    expect(replaced).toEqual([]); // nothing written over a navigation in flight

    await land(0, rerender);
    expect(replaced).toEqual([`/map?q=pils&type=palace_or_castle&${P1_QUERY}`]);
    expect(box("Pils")).toBeChecked();
  });
});

describe("search, filters and pagination", () => {
  it("a filter change pushes one entry, resets the cursor and keeps the map position", () => {
    navigation.pathname = "/objects";
    const listing = { q: "pils", filters: EMPTY_FILTERS };
    const cursor = encodeCursor({
      name: "Jaunmoku pils",
      id: "11111111-2222-4333-8444-555555555555",
      scope: listingScope(listing),
    });
    navigation.search = `q=pils&cursor=${cursor}&${P1_QUERY}`;
    render(tree());

    fireEvent.click(box("Pils"));
    expect(pushed()).toEqual([`/objects?q=pils&type=palace_or_castle&${P1_QUERY}`]);
    expect(probe.current?.cursor).toBeNull();
  });

  it("a typing burst adds one history entry; leaving the field starts a new burst", async () => {
    vi.useFakeTimers();
    navigation.pathname = "/objects";
    const { rerender } = render(tree());

    fireEvent.change(searchInput(), { target: { value: "rund" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(pushed()).toEqual(["/objects?q=rund"]);
    await land(0, rerender);

    fireEvent.change(searchInput(), { target: { value: "rundāle" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(routerReplaced()).toEqual(["/objects?q=rund%C4%81le"]);
    expect(pushed()).toHaveLength(1);
    await land(1, rerender);

    fireEvent.blur(searchInput());
    fireEvent.change(searchInput(), { target: { value: "cēsis" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(pushed()).toEqual(["/objects?q=rund", "/objects?q=c%C4%93sis"]);
  });

  it("a typing burst whose first commit has not landed pushes again (never replaces the entry before it)", () => {
    vi.useFakeTimers();
    navigation.pathname = "/objects";
    render(tree());

    fireEvent.change(searchInput(), { target: { value: "rund" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    fireEvent.change(searchInput(), { target: { value: "rundāle" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(pushed()).toEqual(["/objects?q=rund", "/objects?q=rund%C4%81le"]);
    expect(routerReplaced()).toEqual([]);
  });

  it("a page link (an external URL change) is followed, keeping the controls", () => {
    navigation.pathname = "/objects";
    navigation.search = "q=pils";
    const { rerender } = render(tree());
    const listing = { q: "pils", filters: EMPTY_FILTERS };
    const cursor = encodeCursor({
      name: "Jaunmoku pils",
      id: "11111111-2222-4333-8444-555555555555",
      scope: listingScope(listing),
    });
    navigation.search = `q=pils&cursor=${cursor}&${P1_QUERY}`;
    act(() => rerender(tree()));

    expect(probe.current?.cursor).toBe(cursor);
    expect(probe.current?.position).toEqual(P1);
    expect(searchInput().value).toBe("pils");
    expect(replaced).toEqual([]);
  });
});

describe("Back/Forward", () => {
  it("restores controls and map position, even over a navigation still in flight", () => {
    navigation.search = `q=pils&${P1_QUERY}`;
    const { rerender } = render(tree());

    fireEvent.click(box("Pils")); // in flight, never lands
    popState(`q=muiza&type=manor_house&${P2_QUERY}`, rerender);

    expect(searchInput().value).toBe("muiza");
    expect(box("Muižas kungu māja")).toBeChecked();
    expect(box("Pils")).not.toBeChecked();
    expect(probe.current?.position).toEqual(P2);
    // The map is told to move there programmatically (a new epoch)...
    expect(mapProps.current?.position).toEqual(P2);
    expect(mapProps.current?.positionEpoch).toBe(1);
    // ...and nothing is written back.
    expect(replaced).toEqual([]);
    expect(routerReplaced()).toEqual([]);
  });

  it("drops a debounced search and a map move started before it", () => {
    vi.useFakeTimers();
    navigation.search = "q=pils";
    const { rerender } = render(tree());
    const epochBefore = probe.current!.epoch;

    fireEvent.change(searchInput(), { target: { value: "pilsēta" } });
    popState("q=muiza", rerender);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    moveMap(P1, epochBefore); // a debounced move from before Back

    expect(pushed()).toEqual([]);
    expect(replaced).toEqual([]);
    expect(searchInput().value).toBe("muiza");
    expect(probe.current?.position).toBeNull();
  });

  it("writes are accepted again in the new epoch", () => {
    navigation.search = "q=pils";
    const { rerender } = render(tree());
    popState("q=muiza", rerender);
    moveMap(P1);
    expect(replaced).toEqual([`/map?q=muiza&${P1_QUERY}`]);
  });
});

describe("Kopēt saiti", () => {
  it("copies the canonical URL of the newest state and says so", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    navigation.search = `q=pils&${P1_QUERY}`;
    render(tree());
    fireEvent.click(box("Pils")); // still in flight: the copied link already has it

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kopēt saiti" }));
    });
    expect(writeText).toHaveBeenCalledWith(
      `http://localhost:3000/map?q=pils&type=palace_or_castle&${P1_QUERY}`.replace(
        "http://localhost:3000",
        window.location.origin,
      ),
    );
    expect(screen.getByText("Saite nokopēta.")).toHaveAttribute("role", "status");
  });

  it("shows the link to copy by hand when the clipboard is unavailable or refuses", async () => {
    for (const clipboard of [
      undefined,
      { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    ]) {
      Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
      navigation.search = "q=pils";
      const { unmount } = render(tree());
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Kopēt saiti" }));
      });
      expect(screen.getByText(/neizdevās nokopēt automātiski/)).toBeInTheDocument();
      const field = screen.getByLabelText("Saite uz šo skatu") as HTMLInputElement;
      expect(field.readOnly).toBe(true);
      expect(field.value).toBe(`${window.location.origin}/map?q=pils`);
      expect(document.activeElement).toBe(field);
      unmount();
    }
  });
});
