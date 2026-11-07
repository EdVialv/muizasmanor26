import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SiteFooter from "./SiteFooter";

describe("SiteFooter", () => {
  it("renders a footer landmark with the site name and the current year", () => {
    render(<SiteFooter />);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Latvijas muižas");
    expect(footer).toHaveTextContent(String(new Date().getFullYear()));
  });
});
