import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));

async function renderAt(pathname: string) {
  usePathname.mockReturnValue(pathname);
  const { default: SiteHeader } = await import("./SiteHeader");
  render(<SiteHeader />);
}

describe("SiteHeader", () => {
  it("renders the site wordmark linking to the homepage", async () => {
    await renderAt("/");

    const wordmark = screen.getByRole("link", { name: "Latvijas muižas" });
    expect(wordmark).toHaveAttribute("href", "/");
  });

  it("exposes a labelled primary-navigation landmark", async () => {
    await renderAt("/");

    expect(screen.getByRole("navigation", { name: "Galvenā navigācija" })).toBeInTheDocument();
  });

  it("lists Home and the directory, each linking to its own route", async () => {
    await renderAt("/");

    const homeLink = screen.getByRole("link", { name: "Sākums" });
    expect(homeLink).toHaveAttribute("href", "/");

    const directoryLink = screen.getByRole("link", { name: "Objekti" });
    expect(directoryLink).toHaveAttribute("href", "/objects");
  });

  it("marks Home as the current page when the pathname is /", async () => {
    await renderAt("/");

    expect(screen.getByRole("link", { name: "Sākums" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Objekti" })).not.toHaveAttribute("aria-current");
  });

  it("marks the directory as the current page when the pathname is /objects", async () => {
    await renderAt("/objects");

    expect(screen.getByRole("link", { name: "Objekti" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Sākums" })).not.toHaveAttribute("aria-current");
  });

  it("marks neither item current on an unrelated route (e.g. a future detail page)", async () => {
    await renderAt("/objects/rundales-pils");

    expect(screen.getByRole("link", { name: "Sākums" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Objekti" })).not.toHaveAttribute("aria-current");
  });
});
