import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ObjectImage from "./ObjectImage";

const BLOGGER_URL =
  "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjqvsX/s3754/Rund%C4%81les%20pils.jpg";

describe("ObjectImage", () => {
  it("renders a lazy image with a Blogger-resized srcset and the given sizes and alt", () => {
    render(<ObjectImage src={BLOGGER_URL} alt="Rundāles pils no parka puses" sizes="50vw" />);

    const image = screen.getByRole("img", { name: "Rundāles pils no parka puses" });
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("sizes", "50vw");
    const srcset = image.getAttribute("srcset") ?? "";
    expect(srcset).toContain("/s640/Rund%C4%81les%20pils.jpg 640w");
    // Several widths, none of them Next's own optimizer endpoint.
    expect(srcset.split(",").length).toBeGreaterThan(3);
    expect(srcset).not.toContain("/_next/image");
  });

  it("loads the top-of-page image eagerly when asked", () => {
    render(<ObjectImage src={BLOGGER_URL} alt="Rundāles pils" sizes="100vw" eager />);

    expect(screen.getByRole("img", { name: "Rundāles pils" })).toHaveAttribute("loading", "eager");
  });

  it("falls back to the untouched original URL when a resized request fails", () => {
    render(<ObjectImage src={BLOGGER_URL} alt="Rundāles pils" sizes="100vw" />);

    fireEvent.error(screen.getByRole("img", { name: "Rundāles pils" }));

    const image = screen.getByRole("img", { name: "Rundāles pils" });
    expect(image).toHaveAttribute("src", BLOGGER_URL);
    expect(image.getAttribute("srcset") ?? "").not.toContain("/s640/");
  });

  it("when the original fails too, says so and links to the picture at its source", () => {
    render(<ObjectImage src={BLOGGER_URL} alt="Rundāles pils" sizes="100vw" />);

    fireEvent.error(screen.getByRole("img", { name: "Rundāles pils" }));
    fireEvent.error(screen.getByRole("img", { name: "Rundāles pils" }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/attēlu neizdevās parādīt/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /atvērt attēlu avotā: rundāles pils/i });
    expect(link).toHaveAttribute("href", BLOGGER_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("uses a non-Blogger URL as it is, with no resized srcset, and links to it on failure", () => {
    render(<ObjectImage src="https://example.org/foto.jpg" alt="Foto" sizes="100vw" />);

    const image = screen.getByRole("img", { name: "Foto" });
    expect(image).toHaveAttribute("src", "https://example.org/foto.jpg");

    fireEvent.error(image);
    expect(screen.getByRole("link", { name: /atvērt attēlu avotā/i })).toHaveAttribute(
      "href",
      "https://example.org/foto.jpg",
    );
  });

  it("gives a decorative image's fallback link a name of its own", () => {
    render(<ObjectImage src="https://example.org/foto.jpg" alt="" sizes="100vw" />);

    fireEvent.error(document.querySelector("img") as HTMLImageElement);

    expect(
      screen.getByRole("link", { name: "Atvērt attēlu avotā (jaunā cilnē)" }),
    ).toBeInTheDocument();
  });

  it("inside an existing link, falls back to plain text - never a link inside a link", () => {
    render(
      <a href="https://example.org/foto.jpg">
        <ObjectImage src="https://example.org/foto.jpg" alt="Foto" sizes="100vw" insideLink />
      </a>,
    );

    fireEvent.error(document.querySelector("img") as HTMLImageElement);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent(/atvērt to avotā/i);
  });
});
