import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

// AppShell renders SiteHeader, which is a client component calling
// usePathname() (Day 13 - see SiteHeader.tsx) and needs an App Router
// context this test does not mount. Stub it the same way
// SiteHeader.test.tsx does, since AppShell's own tests don't care which
// route is "current".
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("AppShell", () => {
  it("renders a skip link that targets the main-content landmark", () => {
    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );

    const skipLink = screen.getByRole("link", { name: "Pāriet uz galveno saturu" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
  });

  it("composes header, a main landmark wrapping the children, and footer in order", () => {
    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );

    const banner = screen.getByRole("banner");
    const main = screen.getByRole("main");
    const footer = screen.getByRole("contentinfo");

    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveTextContent("Page content");

    // DOM order: header, then main, then footer.
    expect(banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders exactly one main landmark so children never duplicate it", () => {
    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});
