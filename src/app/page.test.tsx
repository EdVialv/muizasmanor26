import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

// The server-only featured query is exercised in HomeFeatured.test.tsx.
vi.mock("@/components/HomeFeatured", () => ({ default: () => <p>Publicētie objekti</p> }));

describe("Discovery homepage", () => {
  it("offers a GET search into the real directory", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: /atklāj latvijas muižas/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("search")).toHaveAttribute("action", "/objects");
    expect(screen.getByRole("search")).toHaveAttribute("method", "get");
    expect(screen.getByRole("searchbox", { name: "Meklēt muižu vai vietu" })).toHaveAttribute(
      "name",
      "q",
    );
    expect(screen.getByRole("button", { name: "Meklēt" })).toHaveAttribute("type", "submit");
  });
  it("links discovery shortcuts to supported filters and the map", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: "Pilis" })).toHaveAttribute(
      "href",
      "/objects?type=palace_or_castle",
    );
    expect(screen.getByRole("link", { name: "Brīvi apmeklējamas" })).toHaveAttribute(
      "href",
      "/objects?access=open",
    );
    expect(screen.getByRole("button", { name: "Izpētīt kartē" })).toHaveAttribute(
      "formaction",
      "/map",
    );
    expect(screen.getByRole("button", { name: "Izpētīt kartē" })).toHaveAttribute(
      "form",
      "home-search-form",
    );
  });
});
