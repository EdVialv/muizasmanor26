import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ObjectSourcesSection from "./ObjectSourcesSection";

describe("ObjectSourcesSection", () => {
  it("links the recorded source and prints the recorded verification date", () => {
    render(
      <ObjectSourcesSection
        object={{
          sourceUrl: "https://www.rundale.net/lv/vesture",
          lastVerifiedAt: "2026-10-08T00:00:00+00:00",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "rundale.net" })).toHaveAttribute(
      "href",
      "https://www.rundale.net/lv/vesture",
    );
    expect(screen.getByText("2026. gada 8. oktobris")).toHaveAttribute(
      "datetime",
      "2026-10-08T00:00:00+00:00",
    );
  });

  it("renders nothing when neither a source nor a verification date is recorded", () => {
    const { container } = render(
      <ObjectSourcesSection object={{ sourceUrl: null, lastVerifiedAt: null }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("never substitutes today's date for a missing or unparseable verification date", () => {
    render(
      <ObjectSourcesSection
        object={{ sourceUrl: "https://example.org/", lastVerifiedAt: "not a date" }}
      />,
    );

    expect(screen.queryByText("Informācija pārbaudīta")).not.toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
  });
});
