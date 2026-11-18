import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTERS, type DirectoryListing } from "@/lib/directory/filters";
import { MAP_FETCH_DEBOUNCE_MS, mapDataHref, useMapData } from "./useMapData";

const VIEWPORT = { west: 24, south: 56.8, east: 24.4, north: 57.1, zoom: 11 };
const LISTING: DirectoryListing = { q: null, filters: EMPTY_FILTERS };

function body(ids: string[]) {
  return {
    mode: "objects",
    objects: ids.map((id) => ({
      id,
      slug: `s-${id}`,
      name: id,
      objectType: "manor_estate",
      latitude: 56.9,
      longitude: 24.1,
    })),
    clusters: [],
    total: ids.length,
  };
}

function deferred() {
  let resolve: (value: Response) => void = () => {};
  const promise = new Promise<Response>((r) => (resolve = r));
  return {
    promise,
    resolve: (b: unknown) => resolve({ ok: true, json: async () => b } as Response),
  };
}

async function flush(ms = MAP_FETCH_DEBOUNCE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("mapDataHref", () => {
  it("carries the canonical listing, bbox and zoom - never a cursor", () => {
    expect(
      mapDataHref(
        {
          q: "pils",
          filters: { ...EMPTY_FILTERS, services: ["catering"], conditions: ["unknown"] },
        },
        VIEWPORT,
      ),
    ).toBe(
      "/api/directory/map?q=pils&service=catering&condition=unknown&bbox=24%2C56.8%2C24.4%2C57.1&zoom=11",
    );
  });
});

describe("useMapData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("does nothing until the map reports a viewport", async () => {
    const fetchMock = vi.fn();
    const { result } = renderHook(() => useMapData(LISTING, null, fetchMock));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe("idle");
  });

  it("debounces rapid viewport changes into one request", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body(["a"]) }) as Response);
    const { rerender, result } = renderHook(({ v }) => useMapData(LISTING, v, fetchMock), {
      initialProps: { v: VIEWPORT },
    });
    for (let i = 1; i <= 5; i += 1) {
      rerender({ v: { ...VIEWPORT, west: 24 + i * 0.01 } });
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
    }
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls as unknown[][])[0][0])).toContain("bbox=24.05%2C");
    expect(result.current.state.kind).toBe("ready");
  });

  it("aborts the older request and never lets its late answer replace the newer one", async () => {
    const first = deferred();
    const second = deferred();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender, result } = renderHook(({ l }) => useMapData(l, VIEWPORT, fetchMock), {
      initialProps: { l: LISTING },
    });
    await flush();
    rerender({ l: { q: "pils", filters: EMPTY_FILTERS } });
    await flush();

    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    await act(async () => {
      second.resolve(body(["newer"]));
    });
    await act(async () => {
      first.resolve(body(["older"]));
    });
    await flush(0);

    expect(result.current.state).toMatchObject({
      kind: "ready",
      result: { objects: [{ id: "newer" }] },
    });
  });

  it("keeps the previous result through an error, and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => body(["a"]) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "unavailable" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => body(["b"]) });
    const { rerender, result } = renderHook(({ v }) => useMapData(LISTING, v, fetchMock), {
      initialProps: { v: VIEWPORT },
    });
    await flush();
    rerender({ v: { ...VIEWPORT, zoom: 12 } });
    await flush();
    expect(result.current.state).toMatchObject({
      kind: "error",
      previous: { objects: [{ id: "a" }] },
    });

    act(() => result.current.retry());
    await flush();
    expect(result.current.state).toMatchObject({
      kind: "ready",
      result: { objects: [{ id: "b" }] },
    });
  });

  it("does not fetch while the page is hidden, and catches up when it is shown", async () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body(["a"]) }) as Response);
    renderHook(() => useMapData(LISTING, VIEWPORT, fetchMock));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
