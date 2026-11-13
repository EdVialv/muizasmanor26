import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ObjectAccessSection from "./ObjectAccessSection";

const NOTHING = {
  publicAccess: null,
  publicAccessNotesLv: null,
  accessibility: null,
  accessibilityNotesLv: null,
  accessVerifiedAt: null,
};

describe("ObjectAccessSection", () => {
  it("says the information has not been collected when nothing is recorded", () => {
    render(<ObjectAccessSection object={NOTHING} />);

    expect(
      screen.getByRole("heading", { name: "Apmeklējums un piekļūstamība" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/vēl nav apkopota/i)).toBeInTheDocument();
    // "Unknown" must never be worded as "not accessible".
    expect(screen.queryByText(/nav pieejams/i)).not.toBeInTheDocument();
  });

  it("states an explicit 'not accessible' only from a stored value", () => {
    render(
      <ObjectAccessSection
        object={{ ...NOTHING, publicAccess: "not_accessible", accessibility: "not_accessible" }}
      />,
    );

    expect(screen.getByText("Nav pieejams apmeklētājiem")).toBeInTheDocument();
    expect(screen.getByText("Nav pieejams cilvēkiem ar kustību traucējumiem")).toBeInTheDocument();
    expect(screen.queryByText("Nav zināms")).not.toBeInTheDocument();
  });

  it("marks the unrecorded half as unknown when only one of the two is recorded", () => {
    render(<ObjectAccessSection object={{ ...NOTHING, publicAccess: "open" }} />);

    expect(screen.getByText("Atvērts apmeklētājiem")).toBeInTheDocument();
    expect(screen.getAllByText("Nav zināms")).toHaveLength(1);
    expect(screen.queryByText(/nav pieejams cilvēkiem/i)).not.toBeInTheDocument();
  });

  it("shows recorded notes and the recorded verification date", () => {
    render(
      <ObjectAccessSection
        object={{
          publicAccess: "by_appointment",
          publicAccessNotesLv: "Jāpiesakās iepriekš.",
          accessibility: "partially_accessible",
          accessibilityNotesLv: "Pirmais stāvs pieejams ar ratiņkrēslu.",
          accessVerifiedAt: "2026-10-08",
        }}
      />,
    );

    expect(screen.getByText("Apmeklējums pēc pieraksta")).toBeInTheDocument();
    expect(screen.getByText("Jāpiesakās iepriekš.")).toBeInTheDocument();
    expect(screen.getByText("Pirmais stāvs pieejams ar ratiņkrēslu.")).toBeInTheDocument();
    const time = screen.getByText("2026. gada 8. oktobris");
    expect(time).toHaveAttribute("datetime", "2026-10-08");
  });

  it("prints no verification date when none is recorded", () => {
    render(<ObjectAccessSection object={{ ...NOTHING, publicAccess: "open" }} />);

    expect(screen.queryByText("Informācija pārbaudīta")).not.toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
  });
});
