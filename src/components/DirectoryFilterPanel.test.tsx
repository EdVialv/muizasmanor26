import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, replace, navigation } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  navigation: { search: "" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/objects",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import { DirectoryListingProvider } from "./DirectoryListingProvider";
import DirectoryFilterPanel from "./DirectoryFilterPanel";

const REGIONS = [
  { value: "Bauskas novads", count: 12 },
  { value: "Cēsu novads", count: 9 },
];

function lastUrl(): URL {
  const href = push.mock.calls.at(-1)?.[0] as string;
  return new URL(href, "http://localhost");
}

describe("DirectoryFilterPanel", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    navigation.search = "";
  });

  it("offers labelled groups for type, region, access and services", () => {
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    expect(screen.getByRole("group", { name: "Objekta veids" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Novads" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Apmeklējuma iespējas" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Pakalpojumi" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Pils" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Naktsmītnes" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Ēdināšana" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Pasākumu rīkošana" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pievienot novadu")).toBeInTheDocument();
  });

  it("explains that access is not ownership, and that services must be recorded", () => {
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    expect(screen.getByText(/nav saistīts ar to, kam objekts pieder/i)).toBeInTheDocument();
    expect(screen.getByText(/kuriem pakalpojums ir reģistrēts/i)).toBeInTheDocument();
  });

  it("reflects the URL in the controls and lists each active filter", () => {
    navigation.search = "type=palace_or_castle&region=Cēsu novads&access=open&service=catering";
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    expect(screen.getByRole("checkbox", { name: "Pils" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ēdināšana" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Naktsmītnes" })).not.toBeChecked();
    for (const label of ["Pils", "Cēsu novads", "Atvērts apmeklētājiem", "Ēdināšana"]) {
      expect(screen.getByRole("button", { name: `Noņemt filtru: ${label}` })).toBeInTheDocument();
    }
    expect(screen.getByText(/^Filtri \(4\)$/)).toBeInTheDocument();
  });

  it("applies a filter at once: keeps the search, drops the cursor", () => {
    navigation.search = "q=muiža&cursor=abc";
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Pils" }));

    const url = lastUrl();
    expect(url.pathname).toBe("/objects");
    expect(url.searchParams.get("q")).toBe("muiža");
    expect(url.searchParams.getAll("type")).toEqual(["palace_or_castle"]);
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("adds a second value in the same group (OR) and keeps other groups", () => {
    navigation.search = "type=palace_or_castle&service=catering";
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Parks vai dārzs" }));

    const url = lastUrl();
    expect(url.searchParams.getAll("type")).toEqual(["palace_or_castle", "park_or_garden"]);
    expect(url.searchParams.getAll("service")).toEqual(["catering"]);
  });

  it("adds a region from the list, and removes it from the list once chosen", () => {
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    fireEvent.change(screen.getByLabelText("Pievienot novadu"), {
      target: { value: "Cēsu novads" },
    });

    expect(lastUrl().searchParams.getAll("region")).toEqual(["Cēsu novads"]);
    const select = screen.getByLabelText("Pievienot novadu");
    expect(within(select).queryByRole("option", { name: /Cēsu novads/ })).not.toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Bauskas novads (12)" })).toBeInTheDocument();
  });

  it("says when the region list is unavailable, and keeps the other filters usable", () => {
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={null} />
      </DirectoryListingProvider>,
    );

    expect(screen.getByText(/novadu saraksts šobrīd nav pieejams/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Ēdināšana" }));
    expect(lastUrl().searchParams.getAll("service")).toEqual(["catering"]);
  });

  it("removes one filter from its chip, keeping the rest and the search", () => {
    navigation.search = "q=pils&type=palace_or_castle&access=open";
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Noņemt filtru: Pils" }));

    const url = lastUrl();
    expect(url.searchParams.get("q")).toBe("pils");
    expect(url.searchParams.getAll("type")).toEqual([]);
    expect(url.searchParams.getAll("access")).toEqual(["open"]);
  });

  it("clears all filters while keeping the search", () => {
    navigation.search = "q=pils&type=palace_or_castle&service=events&cursor=abc";
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notīrīt filtrus (paturēt meklēšanu)" }));

    expect(push).toHaveBeenLastCalledWith("/objects?q=pils", { scroll: false });
  });

  it("clears search and filters together with a separate action", () => {
    navigation.search = "q=pils&type=palace_or_castle";
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notīrīt meklēšanu un filtrus" }));

    expect(push).toHaveBeenLastCalledWith("/objects", { scroll: false });
  });

  it("shows no clear actions when there is nothing to clear", () => {
    render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    expect(screen.queryByRole("button", { name: /notīrīt/i })).not.toBeInTheDocument();
  });

  it("keeps the visitor's latest choice while the URL catches up, and can undo it", () => {
    const { rerender } = render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );
    const castle = () => screen.getByRole("checkbox", { name: "Pils" });

    act(() => {
      fireEvent.click(castle());
    });
    expect(castle()).toBeChecked();
    expect(lastUrl().searchParams.getAll("type")).toEqual(["palace_or_castle"]);

    // Undo before the URL has changed: navigates back, not lost.
    act(() => {
      fireEvent.click(castle());
    });
    expect(castle()).not.toBeChecked();
    expect(push).toHaveBeenLastCalledWith("/objects", { scroll: false });

    // The URL then settles on the latest choice.
    navigation.search = "";
    rerender(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );
    expect(castle()).not.toBeChecked();
  });

  it("follows the URL when it changes from elsewhere (Back/Forward)", () => {
    navigation.search = "service=catering";
    const { rerender } = render(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );
    expect(screen.getByRole("checkbox", { name: "Ēdināšana" })).toBeChecked();

    navigation.search = "service=events";
    rerender(
      <DirectoryListingProvider>
        <DirectoryFilterPanel regionOptions={REGIONS} />
      </DirectoryListingProvider>,
    );

    expect(screen.getByRole("checkbox", { name: "Ēdināšana" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pasākumu rīkošana" })).toBeChecked();
  });

  describe("condition, ownership and family (Day 18)", () => {
    it("offers labelled groups with an explicit not-recorded choice in each", () => {
      render(
        <DirectoryListingProvider>
          <DirectoryFilterPanel regionOptions={REGIONS} />
        </DirectoryListingProvider>,
      );

      const condition = screen.getByRole("group", { name: "Stāvoklis" });
      for (const label of ["Vēsturiska vieta", "Bojāta ēka", "B klase", "A klase"]) {
        expect(within(condition).getByRole("checkbox", { name: label })).toBeInTheDocument();
      }
      expect(
        within(condition).getByRole("checkbox", { name: "Nezināms / nav reģistrēts" }),
      ).toBeInTheDocument();
      expect(within(condition).getByText(/iekšēja klasifikācija/i)).toBeInTheDocument();

      const ownership = screen.getByRole("group", { name: "Pašreizējais īpašnieks" });
      expect(
        within(ownership)
          .getAllByRole("checkbox")
          .map((c) => c.getAttribute("value")),
      ).toEqual(["private", "public", "unknown"]);
      expect(
        within(ownership).getByText(/nevis tas, vai objektu var apmeklēt/i),
      ).toBeInTheDocument();

      const family = screen.getByRole("group", { name: "Vēsturiskā īpašnieku dzimta" });
      expect(
        within(family).getByRole("combobox", { name: "Meklēt un pievienot dzimtu" }),
      ).toBeInTheDocument();
      expect(
        within(family).getByRole("checkbox", { name: "Nezināma / nav reģistrēta" }),
      ).toBeInTheDocument();
    });

    it("never labels a missing value as private, ruined or no family", () => {
      navigation.search = "condition=unknown&ownership=unknown&family_unknown=1";
      render(
        <DirectoryListingProvider>
          <DirectoryFilterPanel regionOptions={REGIONS} />
        </DirectoryListingProvider>,
      );

      const chips = screen.getAllByRole("button", { name: /^Noņemt filtru:/ });
      expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
        "Noņemt filtru: Stāvoklis nav reģistrēts",
        "Noņemt filtru: Īpašnieks nav reģistrēts",
        "Noņemt filtru: Dzimta nav reģistrēta",
      ]);
      for (const chip of chips) {
        expect(chip.textContent).not.toMatch(/privāt|drupas|bez dzimtas/i);
      }
    });

    it("reflects the new parameters in the controls, chips and count", () => {
      navigation.search =
        "condition=class_a&condition=unknown&ownership=public&family=von Biron&family_unknown=1";
      render(
        <DirectoryListingProvider>
          <DirectoryFilterPanel regionOptions={REGIONS} />
        </DirectoryListingProvider>,
      );

      expect(screen.getByRole("checkbox", { name: "A klase" })).toBeChecked();
      expect(
        within(screen.getByRole("group", { name: "Stāvoklis" })).getByRole("checkbox", {
          name: "Nezināms / nav reģistrēts",
        }),
      ).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Publisks (pašvaldība vai valsts)" }),
      ).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Nezināma / nav reģistrēta" })).toBeChecked();
      expect(
        screen.getByRole("button", { name: "Noņemt filtru: Dzimta: von Biron" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/^Filtri \(5\)$/)).toBeInTheDocument();
    });

    it('applies a known value and "unknown" in the same group, keeping the search and dropping the cursor', () => {
      navigation.search = "q=muiža&condition=damaged&cursor=abc";
      render(
        <DirectoryListingProvider>
          <DirectoryFilterPanel regionOptions={REGIONS} />
        </DirectoryListingProvider>,
      );

      fireEvent.click(
        within(screen.getByRole("group", { name: "Stāvoklis" })).getByRole("checkbox", {
          name: "Nezināms / nav reģistrēts",
        }),
      );

      const url = lastUrl();
      expect(url.searchParams.get("q")).toBe("muiža");
      expect(url.searchParams.getAll("condition")).toEqual(["damaged", "unknown"]);
      expect(url.searchParams.has("cursor")).toBe(false);
    });

    it("toggles family_unknown and ownership groups", () => {
      navigation.search = "type=manor_estate";
      render(
        <DirectoryListingProvider>
          <DirectoryFilterPanel regionOptions={REGIONS} />
        </DirectoryListingProvider>,
      );

      fireEvent.click(screen.getByRole("checkbox", { name: "Nezināma / nav reģistrēta" }));
      expect(lastUrl().searchParams.get("family_unknown")).toBe("1");
      expect(lastUrl().searchParams.getAll("type")).toEqual(["manor_estate"]);

      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "Privāts (privātpersona vai privāts juridiskais subjekts)",
        }),
      );
      expect(lastUrl().searchParams.getAll("ownership")).toEqual(["private"]);
      expect(lastUrl().searchParams.get("family_unknown")).toBe("1");
    });

    it("removes one family from its chip, keeping the other family and the search", () => {
      navigation.search = "q=pils&family=von Biron&family=Ābele";
      render(
        <DirectoryListingProvider>
          <DirectoryFilterPanel regionOptions={REGIONS} />
        </DirectoryListingProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Noņemt filtru: Dzimta: Ābele" }));

      const url = lastUrl();
      expect(url.searchParams.get("q")).toBe("pils");
      expect(url.searchParams.getAll("family")).toEqual(["von Biron"]);
    });

    it("adds a family chosen in the picker", async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ options: [{ value: "von der Pahlen", count: 2 }], hasMore: false }),
          } as Response),
        ),
      );
      try {
        navigation.search = "q=pils&family=von Biron";
        render(
          <DirectoryListingProvider>
            <DirectoryFilterPanel regionOptions={REGIONS} />
          </DirectoryListingProvider>,
        );
        const input = screen.getByRole("combobox", { name: "Meklēt un pievienot dzimtu" });

        fireEvent.change(input, { target: { value: "pahlen" } });
        await act(async () => {
          vi.advanceTimersByTime(300);
        });
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        fireEvent.mouseDown(screen.getByRole("option", { name: "von der Pahlen (2)" }));

        const url = lastUrl();
        expect(url.searchParams.get("q")).toBe("pils");
        expect(url.searchParams.getAll("family")).toEqual(["von Biron", "von der Pahlen"]);
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });

    it("clears the new filters too while keeping the search", () => {
      navigation.search =
        "q=pils&condition=unknown&ownership=private&family=von Biron&family_unknown=1&cursor=abc";
      render(
        <DirectoryListingProvider>
          <DirectoryFilterPanel regionOptions={REGIONS} />
        </DirectoryListingProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Notīrīt filtrus (paturēt meklēšanu)" }));

      expect(push).toHaveBeenLastCalledWith("/objects?q=pils", { scroll: false });
    });
  });

  it("keeps the desktop sidebar open when 'Filtri' is clicked or activated with Enter", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query === "(min-width: 64rem)",
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    try {
      const { container } = render(
        <DirectoryListingProvider>
          <DirectoryFilterPanel regionOptions={REGIONS} />
        </DirectoryListingProvider>,
      );
      const details = container.querySelector("details") as HTMLDetailsElement;
      expect(details.open).toBe(true);
      // What the browser does natively on a click or Enter on <summary>.
      details.open = false;
      fireEvent(details, new Event("toggle"));
      expect(details.open).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
