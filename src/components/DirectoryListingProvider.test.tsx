import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A router whose navigations stay in flight until the test lands them, the
 * way App Router navigations do: push() returns a promise, so the shared
 * transition stays pending until it settles. Landing one sets the URL that
 * useSearchParams() returns.
 */
const { router, navigation } = vi.hoisted(() => {
  const inFlight: Array<{ href: string; settle: () => void }> = [];
  return {
    navigation: { search: "" },
    router: {
      inFlight,
      push: vi.fn(
        (href: string) =>
          new Promise<void>((resolve) => {
            inFlight.push({ href, settle: resolve });
          }),
      ),
      replace: vi.fn(
        (href: string) =>
          new Promise<void>((resolve) => {
            inFlight.push({ href, settle: resolve });
          }),
      ),
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/objects",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import DirectoryFilterPanel from "./DirectoryFilterPanel";
import { DirectoryListingProvider } from "./DirectoryListingProvider";
import DirectorySearchField, { SEARCH_DEBOUNCE_MS } from "./DirectorySearchField";

const REGIONS = [
  { value: "Bauskas novads", count: 12 },
  { value: "Cēsu novads", count: 9 },
];

function tree(): ReactElement {
  return (
    <DirectoryListingProvider>
      <DirectorySearchField />
      <DirectoryFilterPanel regionOptions={REGIONS} />
    </DirectoryListingProvider>
  );
}

const searchInput = () =>
  screen.getByLabelText("Meklēt pēc nosaukuma vai vietas") as HTMLInputElement;
const box = (name: string) => screen.getByRole("checkbox", { name });
const pushed = () => router.push.mock.calls.map(([href]) => href as string);
const lastPushed = () => new URL(pushed().at(-1) ?? "/", "http://localhost");

/** Types a query and submits it at once (Enter). */
function search(text: string) {
  fireEvent.change(searchInput(), { target: { value: text } });
  fireEvent.submit(screen.getByRole("search"));
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

/**
 * Browser Back/Forward: a popstate event, then the App Router updates the
 * URL - whether or not a navigation of ours is in flight.
 */
function popState(search: string, rerender: (ui: ReactElement) => void) {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  navigation.search = search;
  act(() => rerender(tree()));
}

describe("shared listing state: search and filters never overwrite each other", () => {
  beforeEach(() => {
    router.push.mockClear();
    router.replace.mockClear();
    router.inFlight.length = 0;
    navigation.search = "";
  });

  afterEach(async () => {
    // React entangles every pending async transition; settle this test's
    // navigations so none stays "in flight" into the next test.
    await act(async () => {
      for (const navigationInFlight of router.inFlight) {
        navigationInFlight.settle();
      }
    });
  });

  it("keeps a delayed search when a filter is changed before it lands", async () => {
    const { rerender } = render(tree());

    search("muiža");
    expect(pushed()).toEqual(["/objects?q=mui%C5%BEa"]);
    // The search is still in flight - the URL has no q yet.
    fireEvent.click(box("Pils"));

    expect(pushed()[1]).toBe("/objects?q=mui%C5%BEa&type=palace_or_castle");

    // The older search lands late, while the filter change is in flight:
    // it must not take the filter away.
    await land(0, rerender);
    expect(box("Pils")).toBeChecked();
    expect(searchInput().value).toBe("muiža");

    await land(1, rerender);
    expect(box("Pils")).toBeChecked();
    expect(searchInput().value).toBe("muiža");
    expect(navigation.search).toBe("q=mui%C5%BEa&type=palace_or_castle");
  });

  it("keeps a delayed filter change when the search is changed before it lands", async () => {
    const { rerender } = render(tree());

    fireEvent.click(box("Ēdināšana"));
    expect(pushed()).toEqual(["/objects?service=catering"]);
    search("pils");

    expect(pushed()[1]).toBe("/objects?q=pils&service=catering");

    await land(0, rerender);
    expect(searchInput().value).toBe("pils");
    expect(box("Ēdināšana")).toBeChecked();

    await land(1, rerender);
    expect(searchInput().value).toBe("pils");
    expect(box("Ēdināšana")).toBeChecked();
  });

  it("builds every one of rapid alternating changes on the previous one", async () => {
    const { rerender } = render(tree());

    search("a");
    fireEvent.click(box("Pils"));
    search("muiža");
    fireEvent.click(box("Ēdināšana"));
    fireEvent.change(screen.getByLabelText("Pievienot novadu"), {
      target: { value: "Cēsu novads" },
    });
    fireEvent.click(box("Pils"));

    expect(pushed()).toEqual([
      "/objects?q=a",
      "/objects?q=a&type=palace_or_castle",
      "/objects?q=mui%C5%BEa&type=palace_or_castle",
      "/objects?q=mui%C5%BEa&type=palace_or_castle&service=catering",
      "/objects?q=mui%C5%BEa&type=palace_or_castle&region=C%C4%93su+novads&service=catering",
      "/objects?q=mui%C5%BEa&region=C%C4%93su+novads&service=catering",
    ]);

    // The older navigations land out of order and late; none of them may
    // change what the visitor sees.
    for (const index of [2, 0, 4, 1, 3]) {
      await land(index, rerender);
      expect(searchInput().value).toBe("muiža");
      expect(box("Pils")).not.toBeChecked();
      expect(box("Ēdināšana")).toBeChecked();
    }

    await land(5, rerender);
    expect(searchInput().value).toBe("muiža");
    expect(box("Pils")).not.toBeChecked();
    expect(box("Ēdināšana")).toBeChecked();
    expect(screen.getByRole("button", { name: "Noņemt filtru: Cēsu novads" })).toBeInTheDocument();
  });

  it("keeps the latest filters for a debounced search that fires after a filter change", async () => {
    vi.useFakeTimers();
    try {
      render(tree());

      fireEvent.change(searchInput(), { target: { value: "muiža" } });
      // Within the debounce window, a filter is ticked.
      fireEvent.click(box("Pils"));
      expect(lastPushed().search).toBe("?type=palace_or_castle");

      await act(async () => {
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      });

      expect(pushed().at(-1)).toBe("/objects?q=mui%C5%BEa&type=palace_or_castle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps both when the newer navigation completes first and the older one last", async () => {
    const { rerender } = render(tree());

    search("muiža");
    fireEvent.click(box("Pils"));
    fireEvent.click(box("Ēdināšana"));
    search("pils");

    // Newest first, then every older one - an order the App Router should
    // never produce, which must still not lose anything.
    for (const index of [3, 2, 1, 0]) {
      await land(index, rerender);
      expect(searchInput().value).toBe("pils");
      expect(box("Pils")).toBeChecked();
      expect(box("Ēdināšana")).toBeChecked();
    }
    expect(router.replace).toHaveBeenLastCalledWith(
      "/objects?q=pils&type=palace_or_castle&service=catering",
      { scroll: false },
    );
    await land(router.inFlight.length - 1, rerender);
    expect(navigation.search).toBe("q=pils&type=palace_or_castle&service=catering");
  });

  it("keeps active filters and drops the cursor when the search changes", () => {
    navigation.search = "q=pils&type=palace_or_castle&access=open&service=catering&cursor=abc";
    render(tree());

    search("muiža");

    expect(pushed().at(-1)).toBe(
      "/objects?q=mui%C5%BEa&type=palace_or_castle&access=open&service=catering",
    );
    expect(lastPushed().searchParams.has("cursor")).toBe(false);
  });

  it("keeps the active search and drops the cursor when a filter changes", () => {
    navigation.search = "q=pils&type=palace_or_castle&cursor=abc";
    render(tree());

    fireEvent.click(box("Naktsmītnes"));

    expect(pushed().at(-1)).toBe("/objects?q=pils&type=palace_or_castle&service=accommodation");
    expect(lastPushed().searchParams.has("cursor")).toBe(false);
  });

  it("drops the cursor on clearing filters (search kept) and on clearing everything", () => {
    navigation.search = "q=pils&type=palace_or_castle&cursor=abc";
    render(tree());

    fireEvent.click(screen.getByRole("button", { name: "Notīrīt filtrus (paturēt meklēšanu)" }));
    expect(pushed().at(-1)).toBe("/objects?q=pils");

    fireEvent.click(screen.getByRole("button", { name: "Notīrīt meklēšanu un filtrus" }));
    expect(pushed().at(-1)).toBe("/objects");
    expect(searchInput().value).toBe("");
  });

  it("says which control is busy: 'Meklē…' for a search, 'Atlasa…' for a filter", () => {
    render(tree());

    search("pils");
    expect(screen.getByRole("search")).toHaveTextContent("Meklē…");
    expect(screen.queryByText("Atlasa…")).not.toBeInTheDocument();

    fireEvent.click(box("Pils"));
    expect(screen.getByText("Atlasa…")).toBeInTheDocument();
    expect(within(screen.getByRole("search")).queryByText("Meklē…")).not.toBeInTheDocument();
  });

  it("restores the combined search and filters on Back and Forward", async () => {
    const { rerender } = render(tree());

    search("pils");
    await land(0, rerender);
    fireEvent.click(box("Pils"));
    await land(1, rerender);
    search("muiža");
    await land(2, rerender);
    expect(navigation.search).toBe("q=mui%C5%BEa&type=palace_or_castle");

    popState("q=pils&type=palace_or_castle", rerender);
    expect(searchInput().value).toBe("pils");
    expect(box("Pils")).toBeChecked();

    popState("q=pils", rerender);
    expect(searchInput().value).toBe("pils");
    expect(box("Pils")).not.toBeChecked();

    popState("q=pils&type=palace_or_castle", rerender);
    popState("q=mui%C5%BEa&type=palace_or_castle", rerender);
    expect(searchInput().value).toBe("muiža");
    expect(box("Pils")).toBeChecked();

    // A change after Back/Forward builds on the restored state.
    fireEvent.click(box("Ēdināšana"));
    expect(pushed().at(-1)).toBe("/objects?q=mui%C5%BEa&type=palace_or_castle&service=catering");
  });
});

describe("no-JavaScript search form", () => {
  beforeEach(() => {
    navigation.search = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  /** The server-rendered HTML of the search field, as a browser without JavaScript gets it. */
  function serverForm(search: string): HTMLFormElement {
    navigation.search = search;
    const html = renderToString(
      <DirectoryListingProvider>
        <DirectorySearchField />
      </DirectoryListingProvider>,
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    return container.querySelector("form") as HTMLFormElement;
  }

  /** What a native GET submission of the form would request. */
  function submittedUrl(form: HTMLFormElement): string {
    const query = new URLSearchParams(
      Array.from(new FormData(form).entries()).map(([key, value]) => [key, String(value)]),
    ).toString();
    return `${form.getAttribute("action")}?${query}`;
  }

  const hidden = (form: HTMLFormElement) =>
    Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).map((input) => [
      input.name,
      input.value,
    ]);

  it("is a plain GET form carrying every active filter, canonical and repeated, as hidden inputs", () => {
    const form = serverForm(
      "q=pils&service=events&type=palace_or_castle&region=Cēsu novads&type=manor_estate&region=Bauskas novads&access=open&service=catering",
    );

    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/objects");
    expect(form.getAttribute("role")).toBe("search");
    expect(hidden(form)).toEqual([
      ["type", "manor_estate"],
      ["type", "palace_or_castle"],
      ["region", "Bauskas novads"],
      ["region", "Cēsu novads"],
      ["access", "open"],
      ["service", "catering"],
      ["service", "events"],
    ]);
  });

  it("leaves out invalid filter values and the cursor", () => {
    const form = serverForm(
      "q=pils&type=castle&type=manor_estate&access=state&service=spa&region=&cursor=abc",
    );

    expect(hidden(form)).toEqual([["type", "manor_estate"]]);
    expect(form.querySelector('[name="cursor"]')).toBeNull();
  });

  it("submits the new search together with the filters, and no cursor", () => {
    const form = serverForm("q=pils&type=palace_or_castle&service=catering&cursor=abc");
    const input = form.querySelector<HTMLInputElement>('input[name="q"]') as HTMLInputElement;
    expect(input.value).toBe("pils");

    input.value = "Rundāle";

    expect(submittedUrl(form)).toBe(
      "/objects?q=Rund%C4%81le&type=palace_or_castle&service=catering",
    );
  });

  it("keeps the filters when the search is emptied and submitted, or cleared with the link", () => {
    const form = serverForm("q=pils&type=palace_or_castle&region=Cēsu novads");
    (form.querySelector('input[name="q"]') as HTMLInputElement).value = "";

    expect(submittedUrl(form)).toBe("/objects?q=&type=palace_or_castle&region=C%C4%93su+novads");
    const clear = form.querySelector("a.directorySearchClear") as HTMLAnchorElement;
    expect(clear.textContent).toBe("Notīrīt");
    expect(clear.getAttribute("href")).toBe(
      "/objects?type=palace_or_castle&region=C%C4%93su+novads",
    );
  });

  it("is unchanged for a search with no filters: only q is submitted", () => {
    const form = serverForm("q=pils");

    expect(hidden(form)).toEqual([]);
    expect(submittedUrl(form)).toBe("/objects?q=pils");
    expect(form.querySelector("a.directorySearchClear")?.getAttribute("href")).toBe("/objects");
  });

  it("carries the Day 18 filters too: condition, ownership, family and family_unknown (no hydration)", () => {
    const form = serverForm(
      "q=pils&family=von Biron&condition=unknown&type=manor_estate&ownership=public&region=Cēsu novads" +
        "&family=  Ābele &condition=class_a&access=open&service=catering&ownership=unknown" +
        "&family_unknown=1&condition=ruined&ownership=private_person&cursor=abc",
    );

    expect(hidden(form)).toEqual([
      ["type", "manor_estate"],
      ["region", "Cēsu novads"],
      ["access", "open"],
      ["service", "catering"],
      ["condition", "class_a"],
      ["condition", "unknown"],
      ["ownership", "public"],
      ["ownership", "unknown"],
      ["family", "von Biron"],
      ["family", "Ābele"],
      ["family_unknown", "1"],
    ]);
    expect(form.querySelector('[name="cursor"]')).toBeNull();

    (form.querySelector('input[name="q"]') as HTMLInputElement).value = "muiža";
    expect(submittedUrl(form)).toBe(
      "/objects?q=mui%C5%BEa&type=manor_estate&region=C%C4%93su+novads&access=open&service=catering" +
        "&condition=class_a&condition=unknown&ownership=public&ownership=unknown" +
        "&family=von+Biron&family=%C4%80bele&family_unknown=1",
    );
  });
});

describe("shared listing state with the Day 18 filters", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    router.push.mockClear();
    router.replace.mockClear();
    router.inFlight.length = 0;
    navigation.search = "";
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ options: [{ value: "von der Pahlen", count: 4 }], hasMore: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await act(async () => {
      for (const navigationInFlight of router.inFlight) {
        navigationInFlight.settle();
      }
    });
    vi.unstubAllGlobals();
  });

  const unknownIn = (group: string) =>
    within(screen.getByRole("group", { name: group })).getByRole("checkbox", {
      name: /nav reģistrēt/,
    });

  async function pickFamily(text: string, option: string) {
    fireEvent.change(screen.getByRole("combobox", { name: "Meklēt un pievienot dzimtu" }), {
      target: { value: text },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    fireEvent.mouseDown(await screen.findByRole("option", { name: option }));
  }

  it("type a search, then at once select a condition: both survive any landing order", async () => {
    const { rerender } = render(tree());

    search("muiža");
    fireEvent.click(unknownIn("Stāvoklis"));
    expect(pushed()).toEqual(["/objects?q=mui%C5%BEa", "/objects?q=mui%C5%BEa&condition=unknown"]);

    // The newer navigation lands first, the older search last.
    await land(1, rerender);
    await land(0, rerender);
    expect(searchInput().value).toBe("muiža");
    expect(unknownIn("Stāvoklis")).toBeChecked();
    // That stale landing is corrected back to the newest listing...
    expect(router.replace).toHaveBeenLastCalledWith("/objects?q=mui%C5%BEa&condition=unknown", {
      scroll: false,
    });
    // ...and once the correction lands, everything agrees.
    await land(2, rerender);
    expect(navigation.search).toBe("q=mui%C5%BEa&condition=unknown");
    expect(searchInput().value).toBe("muiža");
    expect(unknownIn("Stāvoklis")).toBeChecked();
  });

  it("select ownership, then at once commit a search: both survive any landing order", async () => {
    const { rerender } = render(tree());

    fireEvent.click(box("Publisks (pašvaldība vai valsts)"));
    search("pils");
    expect(pushed()).toEqual(["/objects?ownership=public", "/objects?q=pils&ownership=public"]);

    await land(0, rerender);
    expect(searchInput().value).toBe("pils");
    expect(box("Publisks (pašvaldība vai valsts)")).toBeChecked();
    await land(1, rerender);
    expect(searchInput().value).toBe("pils");
    expect(box("Publisks (pašvaldība vai valsts)")).toBeChecked();
  });

  it("a family picked while a search is in flight keeps the search, and vice versa", async () => {
    const { rerender } = render(tree());

    search("rund");
    await pickFamily("pahlen", "von der Pahlen (4)");
    expect(pushed().at(-1)).toBe("/objects?q=rund&family=von+der+Pahlen");

    fireEvent.click(unknownIn("Vēsturiskā īpašnieku dzimta"));
    search("muiža");
    expect(pushed().at(-1)).toBe("/objects?q=mui%C5%BEa&family=von+der+Pahlen&family_unknown=1");

    for (const index of [3, 0, 2, 1]) {
      await land(index, rerender);
      expect(searchInput().value).toBe("muiža");
      expect(
        screen.getByRole("button", { name: "Noņemt filtru: Dzimta: von der Pahlen" }),
      ).toBeInTheDocument();
      expect(unknownIn("Vēsturiskā īpašnieku dzimta")).toBeChecked();
    }
  });

  it("a debounced search firing after a Day 18 filter keeps that filter", async () => {
    render(tree());

    fireEvent.change(searchInput(), { target: { value: "pils" } });
    fireEvent.click(box("A klase"));
    expect(pushed().at(-1)).toBe("/objects?condition=class_a");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50));
    });

    expect(pushed().at(-1)).toBe("/objects?q=pils&condition=class_a");
  });
});
