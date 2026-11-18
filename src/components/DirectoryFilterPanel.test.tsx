import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, navigation } = vi.hoisted(() => ({
  push: vi.fn(),
  navigation: { search: "" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/objects",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

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
    navigation.search = "";
  });

  it("offers labelled groups for type, region, access and services", () => {
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

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
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

    expect(screen.getByText(/nav saistīts ar to, kam objekts pieder/i)).toBeInTheDocument();
    expect(screen.getByText(/kuriem pakalpojums ir reģistrēts/i)).toBeInTheDocument();
  });

  it("reflects the URL in the controls and lists each active filter", () => {
    navigation.search = "type=palace_or_castle&region=Cēsu novads&access=open&service=catering";
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

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
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Pils" }));

    const url = lastUrl();
    expect(url.pathname).toBe("/objects");
    expect(url.searchParams.get("q")).toBe("muiža");
    expect(url.searchParams.getAll("type")).toEqual(["palace_or_castle"]);
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("adds a second value in the same group (OR) and keeps other groups", () => {
    navigation.search = "type=palace_or_castle&service=catering";
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Parks vai dārzs" }));

    const url = lastUrl();
    expect(url.searchParams.getAll("type")).toEqual(["palace_or_castle", "park_or_garden"]);
    expect(url.searchParams.getAll("service")).toEqual(["catering"]);
  });

  it("adds a region from the list, and removes it from the list once chosen", () => {
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

    fireEvent.change(screen.getByLabelText("Pievienot novadu"), {
      target: { value: "Cēsu novads" },
    });

    expect(lastUrl().searchParams.getAll("region")).toEqual(["Cēsu novads"]);
    const select = screen.getByLabelText("Pievienot novadu");
    expect(within(select).queryByRole("option", { name: /Cēsu novads/ })).not.toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Bauskas novads (12)" })).toBeInTheDocument();
  });

  it("says when the region list is unavailable, and keeps the other filters usable", () => {
    render(<DirectoryFilterPanel regionOptions={null} />);

    expect(screen.getByText(/novadu saraksts šobrīd nav pieejams/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Ēdināšana" }));
    expect(lastUrl().searchParams.getAll("service")).toEqual(["catering"]);
  });

  it("removes one filter from its chip, keeping the rest and the search", () => {
    navigation.search = "q=pils&type=palace_or_castle&access=open";
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Noņemt filtru: Pils" }));

    const url = lastUrl();
    expect(url.searchParams.get("q")).toBe("pils");
    expect(url.searchParams.getAll("type")).toEqual([]);
    expect(url.searchParams.getAll("access")).toEqual(["open"]);
  });

  it("clears all filters while keeping the search", () => {
    navigation.search = "q=pils&type=palace_or_castle&service=events&cursor=abc";
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Notīrīt filtrus (paturēt meklēšanu)" }));

    expect(push).toHaveBeenLastCalledWith("/objects?q=pils", { scroll: false });
  });

  it("clears search and filters together with a separate action", () => {
    navigation.search = "q=pils&type=palace_or_castle";
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Notīrīt meklēšanu un filtrus" }));

    expect(push).toHaveBeenLastCalledWith("/objects", { scroll: false });
  });

  it("shows no clear actions when there is nothing to clear", () => {
    render(<DirectoryFilterPanel regionOptions={REGIONS} />);

    expect(screen.queryByRole("button", { name: /notīrīt/i })).not.toBeInTheDocument();
  });

  it("keeps the visitor's latest choice while the URL catches up, and can undo it", () => {
    const { rerender } = render(<DirectoryFilterPanel regionOptions={REGIONS} />);
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
    rerender(<DirectoryFilterPanel regionOptions={REGIONS} />);
    expect(castle()).not.toBeChecked();
  });

  it("follows the URL when it changes from elsewhere (Back/Forward)", () => {
    navigation.search = "service=catering";
    const { rerender } = render(<DirectoryFilterPanel regionOptions={REGIONS} />);
    expect(screen.getByRole("checkbox", { name: "Ēdināšana" })).toBeChecked();

    navigation.search = "service=events";
    rerender(<DirectoryFilterPanel regionOptions={REGIONS} />);

    expect(screen.getByRole("checkbox", { name: "Ēdināšana" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pasākumu rīkošana" })).toBeChecked();
  });
});
