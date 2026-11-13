import { describe, expect, it } from "vitest";
import {
  bloggerImageLoader,
  isResizableBloggerImageUrl,
  resizeBloggerImageUrl,
} from "./bloggerImage";

// The shape of every column G value in the real workbook.
const REAL_SHAPE =
  "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjqvsXelDlOYLfcnhyphenhyphenYDO35jr/s3754/17%20%C5%A0%C4%B7aunes%20biedr%C4%ABbu%20nams%202026%20(2).jpg";

describe("resizeBloggerImageUrl", () => {
  it("replaces only the size segment, keeping the encoded file name byte-for-byte", () => {
    expect(resizeBloggerImageUrl(REAL_SHAPE, 640)).toBe(
      "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjqvsXelDlOYLfcnhyphenhyphenYDO35jr/s640/17%20%C5%A0%C4%B7aunes%20biedr%C4%ABbu%20nams%202026%20(2).jpg",
    );
  });

  it("never requests more than the original's recorded size", () => {
    expect(resizeBloggerImageUrl(REAL_SHAPE, 5000)).toContain("/s3754/");
  });

  it("handles legacy *.bp.blogspot.com URLs and width/height size segments", () => {
    expect(
      resizeBloggerImageUrl("https://1.bp.blogspot.com/-abc/XyZ/AAA/bbb/w640-h480/foto.jpg", 320),
    ).toBe("https://1.bp.blogspot.com/-abc/XyZ/AAA/bbb/s320/foto.jpg");
  });

  it("returns null for anything that is not a resizable Blogger image", () => {
    expect(resizeBloggerImageUrl("https://example.org/images/s640/foto.jpg", 320)).toBeNull();
    expect(
      resizeBloggerImageUrl("http://blogger.googleusercontent.com/img/b/x/y/s640/f.jpg", 320),
    ).toBeNull();
    expect(
      resizeBloggerImageUrl("https://blogger.googleusercontent.com/img/b/x/y/f.jpg", 320),
    ).toBeNull();
    expect(resizeBloggerImageUrl("not a url", 320)).toBeNull();
    expect(resizeBloggerImageUrl(REAL_SHAPE, 0)).toBeNull();
    expect(resizeBloggerImageUrl(REAL_SHAPE, Number.NaN)).toBeNull();
  });

  it("does not treat a look-alike host as Blogger", () => {
    expect(
      resizeBloggerImageUrl(
        "https://blogger.googleusercontent.com.evil.example/img/b/x/y/s640/f.jpg",
        320,
      ),
    ).toBeNull();
    expect(isResizableBloggerImageUrl("https://evilbp.blogspot.com.example/a/s640/f.jpg")).toBe(
      false,
    );
  });
});

describe("bloggerImageLoader", () => {
  it("resizes a Blogger URL to the requested width", () => {
    expect(bloggerImageLoader({ src: REAL_SHAPE, width: 960 })).toContain("/s960/");
  });

  it("returns any other URL unchanged", () => {
    expect(bloggerImageLoader({ src: "https://example.org/foto.jpg", width: 960 })).toBe(
      "https://example.org/foto.jpg",
    );
  });
});
