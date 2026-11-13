import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, navigation } = vi.hoisted(() => ({
  push: vi.fn(),
  navigation: { search: "" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/objects",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import DirectorySearchField, { buildSearchHref, SEARCH_DEBOUNCE_MS } from "./DirectorySearchField";

function input() {
  return screen.getByLabelText("Meklēt pēc nosaukuma vai vietas") as HTMLInputElement;
}

describe("buildSearchHref", () => {
  it("starts a search on its first page (never carries a cursor) and clears to the plain directory", () => {
    expect(buildSearchHref("/objects", "Rundāles pils")).toBe("/objects?q=Rund%C4%81les+pils");
    expect(buildSearchHref("/objects", null)).toBe("/objects");
  });
});

describe("DirectorySearchField", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockClear();
    navigation.search = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a labelled search landmark with a hint and a live status region", () => {
    render(<DirectorySearchField />);

    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(input()).toHaveAttribute("type", "search");
    expect(input()).toHaveAttribute("name", "q");
    expect(input()).toHaveAccessibleDescription(/garumzīmes un lielie burti nav jāievēro/i);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("starts from the query in the URL", () => {
    navigation.search = "q=Rund%C4%81le";
    render(<DirectorySearchField />);

    expect(input().value).toBe("Rundāle");
  });

  it("commits to the URL only after 300 ms without typing", () => {
    render(<DirectorySearchField />);

    fireEvent.change(input(), { target: { value: "r" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    fireEvent.change(input(), { target: { value: "ru" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    fireEvent.change(input(), { target: { value: "run" } });
    expect(push).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/objects?q=run", { scroll: false });
  });

  it("does nothing when an edit leaves the normalised query unchanged", () => {
    navigation.search = "q=pils";
    render(<DirectorySearchField />);

    fireEvent.change(input(), { target: { value: "  pils  " } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));

    expect(push).not.toHaveBeenCalled();
  });

  it("commits at once on Enter, cancelling the pending debounce", () => {
    render(<DirectorySearchField />);

    fireEvent.change(input(), { target: { value: "cēsis" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith("/objects?q=c%C4%93sis", { scroll: false });

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("clears to the plain directory at once and keeps keyboard focus in the field", () => {
    navigation.search = "q=pils";
    render(<DirectorySearchField />);

    fireEvent.click(screen.getByRole("button", { name: "Notīrīt" }));

    expect(push).toHaveBeenCalledWith("/objects", { scroll: false });
    expect(input().value).toBe("");
    expect(input()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Notīrīt" })).not.toBeInTheDocument();
  });

  it("clearing the text by typing also returns to the plain directory", () => {
    navigation.search = "q=pils";
    render(<DirectorySearchField />);

    fireEvent.change(input(), { target: { value: "" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));

    expect(push).toHaveBeenCalledWith("/objects", { scroll: false });
  });

  it("follows the URL when it changes from elsewhere (browser Back/Forward)", () => {
    navigation.search = "q=pils";
    const { rerender } = render(<DirectorySearchField />);

    navigation.search = "q=mui%C5%BEa";
    rerender(<DirectorySearchField />);

    expect(input().value).toBe("muiža");
  });

  it("does not overwrite newer typing when its own earlier search lands in the URL", () => {
    const { rerender } = render(<DirectorySearchField />);

    fireEvent.change(input(), { target: { value: "rund" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(push).toHaveBeenLastCalledWith("/objects?q=rund", { scroll: false });

    // The visitor keeps typing while that navigation is still in flight...
    fireEvent.change(input(), { target: { value: "rundāle" } });
    // ...then the older URL arrives.
    navigation.search = "q=rund";
    rerender(<DirectorySearchField />);

    expect(input().value).toBe("rundāle");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(push).toHaveBeenLastCalledWith("/objects?q=rund%C4%81le", { scroll: false });
  });

  it("caps input length at the server's bound", () => {
    render(<DirectorySearchField />);

    expect(input()).toHaveAttribute("maxLength", "200");
  });
});
