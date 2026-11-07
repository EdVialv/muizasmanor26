import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell";

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
