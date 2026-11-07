import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SiteHeader from "./SiteHeader";

describe("SiteHeader", () => {
  it("renders the site wordmark linking to the homepage", () => {
    render(<SiteHeader />);

    const wordmark = screen.getByRole("link", { name: "Latvijas muižas" });
    expect(wordmark).toHaveAttribute("href", "/");
  });

  it("exposes a labelled primary-navigation landmark", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("navigation", { name: "Galvenā navigācija" })).toBeInTheDocument();
  });

  it("links Home as the current page", () => {
    render(<SiteHeader />);

    const homeLink = screen.getByRole("link", { name: "Sākums" });
    expect(homeLink).toHaveAttribute("href", "/");
    expect(homeLink).toHaveAttribute("aria-current", "page");
  });
});
