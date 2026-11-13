import { describe, expect, it } from "vitest";
import { displayHost, mailtoHref, safeHttpUrl, telHref } from "./safeLinks";

describe("safeHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(safeHttpUrl("https://rundale.net/lv/")).toBe("https://rundale.net/lv/");
    expect(safeHttpUrl("  http://example.org  ")).toBe("http://example.org/");
  });

  it("refuses every other scheme and anything unparseable", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("ftp://example.org/file")).toBeNull();
    expect(safeHttpUrl("//example.org")).toBeNull();
    expect(safeHttpUrl("www.example.org")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});

describe("displayHost", () => {
  it("shows the host without www", () => {
    expect(displayHost("https://www.rundale.net/lv/muzejs")).toBe("rundale.net");
  });
});

describe("mailtoHref", () => {
  it("links a plain e-mail address", () => {
    expect(mailtoHref("info@rundale.net")).toBe("mailto:info@rundale.net");
  });

  it("refuses anything that could smuggle headers or markup", () => {
    expect(mailtoHref("info@rundale.net?subject=x")).toBeNull();
    expect(mailtoHref("info@rundale.net&cc=x@y.lv")).toBeNull();
    expect(mailtoHref("not an email")).toBeNull();
    expect(mailtoHref("a@b")).toBeNull();
    expect(mailtoHref('"><script>@x.lv')).toBeNull();
  });
});

describe("telHref", () => {
  it("links a phone number, stripping separators", () => {
    expect(telHref("+371 63 962 197")).toBe("tel:+37163962197");
    expect(telHref("(639) 62-197")).toBe("tel:63962197");
  });

  it("refuses text that is not a phone number", () => {
    expect(telHref("zvanīt pēc 9")).toBeNull();
    expect(telHref("12")).toBeNull();
    expect(telHref("javascript:alert(1)")).toBeNull();
  });
});
