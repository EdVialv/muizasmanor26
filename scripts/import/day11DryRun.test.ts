import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { cellHyperlinkOrText, cellText, parseArgs, readWorkbookRows } from "./day11DryRun";

describe("parseArgs", () => {
  it("requires --file and --out-dir", () => {
    expect(() => parseArgs([])).toThrow("usage:");
    expect(() => parseArgs(["--file", "x.xlsx"])).toThrow("usage:");
  });

  it("defaults --source-system to manasvietas_blogspot", () => {
    const args = parseArgs(["--file", "x.xlsx", "--out-dir", "out"]);
    expect(args.sourceSystem).toBe("manasvietas_blogspot");
  });

  it("accepts an explicit --source-system", () => {
    const args = parseArgs(["--file", "x.xlsx", "--out-dir", "out", "--source-system", "custom"]);
    expect(args.sourceSystem).toBe("custom");
  });
});

describe("cellText", () => {
  it("returns the displayed text of a hyperlink cell, not its target", () => {
    expect(cellText({ text: "Skatīt emuāru", hyperlink: "https://example.test/post/1" })).toBe(
      "Skatīt emuāru",
    );
  });

  it("joins richText runs and passes through plain strings/numbers", () => {
    expect(cellText({ richText: [{ text: "Bērzu " }, { text: "muiža" }] })).toBe("Bērzu muiža");
    expect(cellText("plain text")).toBe("plain text");
    expect(cellText(42)).toBe("42");
    expect(cellText(null)).toBe("");
  });
});

describe("cellHyperlinkOrText", () => {
  // Regression tests for a Day 11 Codex review finding: a hyperlink cell's
  // *target*, not its displayed text, is the real data for a URL column.
  it("returns the hyperlink target when the cell is hyperlink-shaped", () => {
    expect(
      cellHyperlinkOrText({ text: "Skatīt emuāru", hyperlink: "https://example.test/post/1" }),
    ).toBe("https://example.test/post/1");
  });

  it("falls back to the plain cell text for an ordinary (non-hyperlink) text cell", () => {
    expect(cellHyperlinkOrText("https://example.test/plain-url")).toBe(
      "https://example.test/plain-url",
    );
    expect(cellHyperlinkOrText(null)).toBe("");
  });
});

const EXPECTED_HEADER = [
  "Nr.",
  "Bloga ieraksta Nr.",
  "Bloga posta nosaukums",
  "Bloga ieraksta adrese (URL)",
  "Attēla nosaukums Drive",
  "Hipersaite Google Drive",
  "Attēla oriģinālā saite blogā",
  "Adrese",
  "Koordinātas",
  "Attēla paraksts",
  "Posta sekojošais teksts",
];

describe("readWorkbookRows (hyperlink-vs-text column handling)", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function writeWorkbook(cellValues: ExcelJS.CellValue[][]): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Lapa1");
    sheet.addRow(EXPECTED_HEADER);
    for (const rowValues of cellValues) {
      const row = sheet.addRow([]);
      rowValues.forEach((value, i) => {
        row.getCell(i + 1).value = value;
      });
    }
    const dir = mkdtempSync(join(tmpdir(), "day11-dry-run-test-"));
    tempDirs.push(dir);
    const file = join(dir, "test.xlsx");
    await workbook.xlsx.writeFile(file);
    return file;
  }

  it("extracts the hyperlink target for the blog-post URL, Google Drive URL and original image URL columns, leaving ordinary text cells untouched", async () => {
    const file = await writeWorkbook([
      [
        1,
        "101",
        "Testa muiža",
        { text: "Skatīt bloga ierakstu", hyperlink: "https://manasvietas.blogspot.com/101" },
        "attels.jpg",
        {
          text: "Google Drive saite",
          hyperlink: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view",
        },
        { text: "oriģināls attēls", hyperlink: "https://example-blog.test/img/original.jpg" },
        "Kādā iela 1",
        "56.9, 24.1",
        "",
        "Apraksts šeit.",
      ],
    ]);

    const rows = await readWorkbookRows(file);
    expect(rows).toHaveLength(1);
    const [row] = rows;

    // URL columns: the hyperlink target, not the displayed label.
    expect(row.postUrl).toBe("https://manasvietas.blogspot.com/101");
    expect(row.driveUrl).toBe("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view");
    expect(row.originalImageUrl).toBe("https://example-blog.test/img/original.jpg");

    // Ordinary text columns: untouched, still the plain displayed text.
    expect(row.title).toBe("Testa muiža");
    expect(row.driveFilename).toBe("attels.jpg");
    expect(row.address).toBe("Kādā iela 1");
    expect(row.coordinates).toBe("56.9, 24.1");
    expect(row.bodyText).toBe("Apraksts šeit.");
  });

  it("passes plain-text URL cells (no hyperlink formatting) through unchanged", async () => {
    const file = await writeWorkbook([
      [
        1,
        "102",
        "Otra muiža",
        "https://manasvietas.blogspot.com/102",
        "attels2.jpg",
        "https://drive.google.com/file/d/2ZzYyXxWwVvUuTt/view",
        "https://example-blog.test/img/original2.jpg",
        "Cita iela 2",
        "57.0, 25.0",
        "",
        "Vēl viens apraksts.",
      ],
    ]);

    const rows = await readWorkbookRows(file);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.postUrl).toBe("https://manasvietas.blogspot.com/102");
    expect(row.driveUrl).toBe("https://drive.google.com/file/d/2ZzYyXxWwVvUuTt/view");
    expect(row.originalImageUrl).toBe("https://example-blog.test/img/original2.jpg");
  });
});
