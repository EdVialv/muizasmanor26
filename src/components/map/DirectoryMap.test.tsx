import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Navigations stay in flight until the test lands them (as in the Day 17 tests). */
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
// Leaflet cannot run in jsdom: the map is a stub that exposes its props.
vi.mock("next/dynamic", () => ({
  default: () =>
    function LeafletStub(props: Record<string, unknown>) {
      mapProps.current = props;
      return <div data-testid="leaflet-stub" />;
    },
}));

import DirectoryFilterPanel from "@/components/DirectoryFilterPanel";
import { DirectoryListingProvider } from "@/components/DirectoryListingProvider";
import DirectorySearchField from "@/components/DirectorySearchField";
import DirectoryViewSwitch from "@/components/DirectoryViewSwitch";
import { MAP_FETCH_DEBOUNCE_MS } from "./useMapData";
import DirectoryMap from "./DirectoryMap";

const TILES = {
  kind: "configured" as const,
  config: { urlTemplate: "https://t.example/{z}/{x}/{y}.png", attribution: "© T", maxZoom: 19 },
};
const VIEWPORT = { west: 24, south: 56.8, east: 24.4, north: 57.1, zoom: 11 };

function tree(): ReactElement {
  return (
    <DirectoryListingProvider>
      <DirectoryViewSwitch />
      <DirectorySearchField />
      <DirectoryFilterPanel regionOptions={[]} />
      <DirectoryMap tiles={TILES} />
    </DirectoryListingProvider>
  );
}

const objectsBody = (names: string[]) => ({
  mode: "objects",
  objects: names.map((name, i) => ({
    id: `id-${name}`,
    slug: `slug-${i}`,
    name,
    objectType: "manor_estate",
    latitude: 56.9,
    longitude: 24.1 + i * 0.001,
  })),
  clusters: [],
  total: names.length,
});

function respondWith(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

async function settle(ms = MAP_FETCH_DEBOUNCE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const reportViewport = (viewport = VIEWPORT) =>
  act(() => (mapProps.current?.onViewportChange as (v: unknown) => void)(viewport));
const fetchedUrls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([url]) => new URL(url as string, "http://localhost"));

describe("DirectoryMap with the shared listing state", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    router.push.mockClear();
    router.inFlight.length = 0;
    navigation.search = "";
    navigation.pathname = "/map";
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      respondWith(objectsBody(["Ābeļu muiža", "Cēsu pils"])),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await act(async () => {
      router.inFlight.forEach((n) => n.settle());
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("selects a result for the map while keeping its detail-page link", async () => {
    render(tree());
    reportViewport();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Rādīt kartē: Ābeļu muiža" }));
    expect(mapProps.current?.selectedObjectId).toBe("id-Ābeļu muiža");
    expect(screen.getByRole("button", { name: "Rādīt kartē: Ābeļu muiža" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("link", { name: "Ābeļu muiža" })).toHaveAttribute(
      "href",
      "/objects/slug-0?fromView=map",
    );
  });

  it("loads the viewport with the URL's search and filters, and lists what is in view", async () => {
    navigation.search = "q=muiža&condition=unknown&family_unknown=1&cursor=abc";
    render(tree());
    reportViewport();
    await settle();

    const url = fetchedUrls(fetchMock)[0];
    expect(url.pathname).toBe("/api/directory/map");
    expect(url.searchParams.get("q")).toBe("muiža");
    expect(url.searchParams.get("condition")).toBe("unknown");
    expect(url.searchParams.get("family_unknown")).toBe("1");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.get("bbox")).toBe("24,56.8,24.4,57.1");

    expect(screen.getByText(/Šajā kartes skatā: 2 objekti\./)).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Objekti šajā kartes skatā" });
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Ābeļu muiža", "Cēsu pils"]);
    const href = new URL(links[0].getAttribute("href") ?? "", "http://localhost");
    expect(href.pathname).toBe("/objects/slug-0");
    expect(href.searchParams.get("fromView")).toBe("map");
    expect(href.searchParams.get("fromQ")).toBe("muiža");
    expect(href.searchParams.get("fromFilters")).toBe("condition=unknown&family_unknown=1");
  });

  it("uses a filter change at once - even while its navigation is still in flight", async () => {
    render(tree());
    reportViewport();
    await settle();

    fireEvent.click(screen.getByRole("checkbox", { name: "Pils" }));
    expect(router.inFlight).toHaveLength(1); // the URL has not changed yet
    await settle();

    expect(fetchedUrls(fetchMock).at(-1)?.searchParams.getAll("type")).toEqual([
      "palace_or_castle",
    ]);
  });

  it("rapid search, filter and viewport changes cost one request, with the newest combination", async () => {
    render(tree());
    reportViewport();
    await settle();
    fetchMock.mockClear();

    fireEvent.change(screen.getByLabelText("Meklēt pēc nosaukuma vai vietas"), {
      target: { value: "rund" },
    });
    fireEvent.submit(screen.getByRole("search"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Ēdināšana" }));
    reportViewport({ ...VIEWPORT, zoom: 13 });
    fireEvent.click(screen.getByRole("checkbox", { name: "Nezināma / nav reģistrēta" }));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchedUrls(fetchMock)[0];
    expect(url.searchParams.get("q")).toBe("rund");
    expect(url.searchParams.getAll("service")).toEqual(["catering"]);
    expect(url.searchParams.get("family_unknown")).toBe("1");
    expect(url.searchParams.get("zoom")).toBe("13");
  });

  it("ignores a slower answer for an older selection", async () => {
    let resolveOld: (r: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((r) => (resolveOld = r)))
      .mockImplementationOnce(async () => respondWith(objectsBody(["Jaunā muiža"])));
    render(tree());
    reportViewport();
    await settle();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pils" }));
    await settle();

    await act(async () => {
      resolveOld(respondWith(objectsBody(["Vecā muiža"])));
    });
    await settle(0);

    const list = screen.getByRole("region", { name: "Objekti šajā kartes skatā" });
    expect(within(list).getByRole("link", { name: "Jaunā muiža" })).toBeInTheDocument();
    expect(within(list).queryByRole("link", { name: "Vecā muiža" })).not.toBeInTheDocument();
  });

  it("says when results are clustered, and does not pretend to list them", async () => {
    fetchMock.mockImplementation(async () =>
      respondWith({
        mode: "clusters",
        objects: [],
        clusters: [
          {
            latitude: 56.95,
            longitude: 24.2,
            count: 640,
            bounds: { south: 56.8, west: 24.0, north: 57.1, east: 24.4 },
          },
        ],
        total: 640,
      }),
    );
    render(tree());
    reportViewport();
    await settle();

    expect(
      screen.getByText(/Šajā kartes skatā: 640 objekti\. Tie ir apvienoti grupās/),
    ).toBeInTheDocument();
    expect(screen.getByText(/pārāk daudz objektu, lai tos uzskaitītu/)).toBeInTheDocument();
  });

  it("shows no-results and request-error states, and retries", async () => {
    fetchMock
      .mockImplementationOnce(async () => respondWith(objectsBody([])))
      .mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) }) as Response)
      .mockImplementationOnce(async () => respondWith(objectsBody(["A"])));
    navigation.search = "type=outbuilding";
    render(tree());
    reportViewport();
    await settle();
    expect(
      screen.getByText(/nav neviena objekta, kas atbilst meklēšanai un filtriem/),
    ).toBeInTheDocument();

    reportViewport({ ...VIEWPORT, zoom: 12 });
    await settle();
    expect(screen.getByText("Kartes objektus neizdevās ielādēt.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mēģināt vēlreiz" }));
    await settle();
    expect(
      screen.getByText(/Šajā kartes skatā: 1 objekti\.|Šajā kartes skatā: 1 objekts\./),
    ).toBeInTheDocument();
  });

  it("explains a missing base map and a tile failure, keeping the objects", async () => {
    render(
      <DirectoryListingProvider>
        <DirectoryMap tiles={{ kind: "missing" }} />
      </DirectoryListingProvider>,
    );
    expect(mapProps.current?.tiles).toBeNull();
    expect(screen.getByText(/Pamatkarte nav pieejama/)).toBeInTheDocument();

    act(() => (mapProps.current?.onTileFailure as (f: boolean) => void)(true));
    expect(screen.getByText(/fona attēlus neizdevās ielādēt/)).toBeInTheDocument();
  });

  it("links to the full filtered list with the same selection, and switches views keeping it", async () => {
    navigation.search = "q=pils&ownership=public&cursor=abc";
    render(tree());
    reportViewport();
    await settle();

    expect(screen.getByRole("link", { name: "Visi atlasītie objekti sarakstā" })).toHaveAttribute(
      "href",
      "/objects?q=pils&ownership=public",
    );
    const views = screen.getByRole("navigation", { name: "Skats" });
    expect(within(views).getByRole("link", { name: "Saraksts" })).toHaveAttribute(
      "href",
      "/objects?q=pils&ownership=public",
    );
    expect(within(views).getByRole("link", { name: "Karte" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // A change still in flight is already in the switch links.
    fireEvent.click(screen.getByRole("checkbox", { name: "A klase" }));
    expect(within(views).getByRole("link", { name: "Saraksts" })).toHaveAttribute(
      "href",
      "/objects?q=pils&condition=class_a&ownership=public",
    );
  });
});
