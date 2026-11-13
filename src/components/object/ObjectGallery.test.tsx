import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ObjectImageInfo } from "@/lib/objects/detail";
import { imageAltText, ObjectGallery, ObjectHeroImage } from "./ObjectGallery";

function image(n: number, overrides: Partial<ObjectImageInfo> = {}): ObjectImageInfo {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    sourceUrl: `https://blogger.googleusercontent.com/img/b/x/token${n}/s3000/foto-${n}.jpg`,
    altTextLv: null,
    captionLv: null,
    credit: null,
    licenseName: null,
    licenseUrl: null,
    attributionNote: "Foto: manasvietas.blogspot.com",
    isPrimary: n === 1,
    ...overrides,
  };
}

describe("imageAltText", () => {
  it("prefers the recorded alt text, then the recorded caption", () => {
    expect(imageAltText(image(1, { altTextLv: "Fasāde", captionLv: "Paraksts" }), "Pils", 1)).toBe(
      "Fasāde",
    );
    expect(imageAltText(image(1, { captionLv: "Paraksts" }), "Pils", 1)).toBe("Paraksts");
  });

  it("otherwise names the object and the position, without describing the picture", () => {
    expect(imageAltText(image(3), "Rundāles pils", 3)).toBe("Rundāles pils, 3. attēls");
  });
});

describe("ObjectHeroImage", () => {
  it("loads eagerly and prints the recorded attribution", () => {
    render(<ObjectHeroImage image={image(1)} objectName="Rundāles pils" />);

    expect(screen.getByRole("img", { name: "Rundāles pils, 1. attēls" })).toHaveAttribute(
      "loading",
      "eager",
    );
    expect(screen.getByText("Foto: manasvietas.blogspot.com")).toBeInTheDocument();
  });

  it("prints caption, credit and a linked licence when they are recorded", () => {
    render(
      <ObjectHeroImage
        image={image(1, {
          captionLv: "Skats no parka",
          credit: "Jānis Bērziņš",
          licenseName: "CC BY 4.0",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        })}
        objectName="Rundāles pils"
      />,
    );

    expect(screen.getByText("Skats no parka")).toBeInTheDocument();
    expect(
      screen.getByText(/Jānis Bērziņš · Foto: manasvietas\.blogspot\.com/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });

  it("prints no credit line at all when nothing is recorded", () => {
    const { container } = render(
      <ObjectHeroImage image={image(1, { attributionNote: null })} objectName="Rundāles pils" />,
    );

    // Only the link to the original picture, which every hero has.
    const figcaption = container.querySelector("figcaption");
    expect(figcaption?.querySelector(".objectImageCredit")).toBeNull();
    expect(figcaption).toHaveTextContent(/^Atvērt oriģinālo attēlu$/);
  });
});

describe("ObjectGallery", () => {
  it("renders nothing when there are no further images", () => {
    const { container } = render(
      <ObjectGallery images={[]} objectName="Rundāles pils" hasMore={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("lazy-loads each thumbnail and links it to the full-size original in a new tab", () => {
    render(
      <ObjectGallery images={[image(2), image(3)]} objectName="Rundāles pils" hasMore={false} />,
    );

    const thumbnails = screen.getAllByRole("img");
    expect(thumbnails).toHaveLength(2);
    for (const thumbnail of thumbnails) {
      expect(thumbnail).toHaveAttribute("loading", "lazy");
    }

    const link = screen.getByRole("link", { name: /Rundāles pils, 2\. attēls/ });
    expect(link).toHaveAttribute("href", image(2).sourceUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName(/jaunā cilnē/);
  });

  it("prints each distinct credit once below the grid", () => {
    render(
      <ObjectGallery
        images={[image(2), image(3), image(4, { credit: "Jānis Bērziņš" })]}
        objectName="Rundāles pils"
        hasMore={false}
      />,
    );

    expect(
      screen.getByText(
        "Attēlu avoti: Foto: manasvietas.blogspot.com; Jānis Bērziņš · Foto: manasvietas.blogspot.com",
      ),
    ).toBeInTheDocument();
  });

  it("says when only the first images are shown", () => {
    render(<ObjectGallery images={[image(2)]} objectName="Rundāles pils" hasMore />);

    expect(screen.getByText(/rādīti pirmie 24 attēli/i)).toBeInTheDocument();
  });
});

describe("links to the original pictures", () => {
  it("the hero always links to its picture's source URL, whether or not it loads", () => {
    const hero = image(1);
    render(<ObjectHeroImage image={hero} objectName="Rundāles pils" />);

    const link = screen.getByRole("link", { name: /atvērt oriģinālo attēlu/i });
    expect(link).toHaveAttribute("href", hero.sourceUrl);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("a failed gallery thumbnail keeps one link - its own - to the original", () => {
    const thumb = image(2);
    render(<ObjectGallery images={[thumb]} objectName="Rundāles pils" hasMore={false} />);

    for (const img of Array.from(document.querySelectorAll("img"))) {
      fireEvent.error(img);
    }
    for (const img of Array.from(document.querySelectorAll("img"))) {
      fireEvent.error(img);
    }

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", thumb.sourceUrl);
    expect(links[0]).toHaveTextContent(/attēlu neizdevās parādīt/i);
  });
});
