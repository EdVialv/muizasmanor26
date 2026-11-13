import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ObjectContact } from "@/lib/objects/detail";
import ObjectContactsSection from "./ObjectContactsSection";

function contact(overrides: Partial<ObjectContact>): ObjectContact {
  return {
    type: "email",
    label: "Informācija",
    value: "info@example.org",
    isPrimary: false,
    verifiedAt: null,
    ...overrides,
  };
}

describe("ObjectContactsSection", () => {
  it("renders nothing when there are no public contacts", () => {
    const { container } = render(<ObjectContactsSection contacts={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("links e-mail, phone and website contacts with the right scheme", () => {
    render(
      <ObjectContactsSection
        contacts={[
          contact({ type: "email", value: "info@example.org" }),
          contact({ type: "phone", label: "Tālrunis", value: "+371 60 000 000" }),
          contact({ type: "website", label: "Mājaslapa", value: "https://www.example.org/lv" }),
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "info@example.org" })).toHaveAttribute(
      "href",
      "mailto:info@example.org",
    );
    expect(screen.getByRole("link", { name: "+371 60 000 000" })).toHaveAttribute(
      "href",
      "tel:+37160000000",
    );
    expect(screen.getByRole("link", { name: "example.org" })).toHaveAttribute(
      "href",
      "https://www.example.org/lv",
    );
  });

  it("prints an unsafe or malformed value as text and never as a link", () => {
    render(
      <ObjectContactsSection
        contacts={[
          contact({ type: "website", label: "Slikta saite", value: "javascript:alert(1)" }),
          contact({ type: "email", label: "Slikts e-pasts", value: "x@y.lv?cc=z@w.lv" }),
          contact({ type: "phone", label: "Teksts", value: "zvanīt pēc 9" }),
        ]}
      />,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
    expect(screen.getByText("zvanīt pēc 9")).toBeInTheDocument();
  });

  it("prints a postal address as text", () => {
    render(
      <ObjectContactsSection
        contacts={[contact({ type: "address", label: "Adrese", value: "Pilsrundāle, LV-3921" })]}
      />,
    );

    expect(screen.getByText("Pilsrundāle, LV-3921")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows a contact's recorded verification date and none when it has none", () => {
    render(
      <ObjectContactsSection
        contacts={[
          contact({ value: "a@example.org", verifiedAt: "2026-10-08T09:00:00+00:00" }),
          contact({ value: "b@example.org", label: "Cits" }),
        ]}
      />,
    );

    expect(screen.getAllByText(/pārbaudīts/i)).toHaveLength(1);
    expect(screen.getByText("2026. gada 8. oktobris")).toBeInTheDocument();
  });
});
