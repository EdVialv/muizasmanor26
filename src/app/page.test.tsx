import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("renders the main heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: /atklāj latvijas muižas vienuviet/i }),
    ).toBeInTheDocument();
  });

  it("links the hero action to the MVP section", () => {
    render(<Home />);

    const link = screen.getByRole("link", { name: /apskatīt mvp plānu/i });
    expect(link).toHaveAttribute("href", "#mvp");
  });

  it("lists every planned feature exactly once", () => {
    render(<Home />);

    const features = [
      "Muižu katalogs",
      "Meklēšana un filtri",
      "Interaktīva karte",
      "Muižu profili",
      "Pasākumu pieprasījumi",
    ];

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(features.length);

    for (const feature of features) {
      expect(screen.getByText(feature)).toBeInTheDocument();
    }
  });
});
