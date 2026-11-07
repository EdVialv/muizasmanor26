#!/usr/bin/env node
// Day 11 dry run against the real raw blog dataset ("muizasdb_pic.xlsx").
//
// This is READ-ONLY and NON-DESTRUCTIVE by construction: it never imports
// db.ts, never opens a database connection, never touches
// supabase/migrations, and never writes anything to staging_heritage_objects
// or heritage_objects. It reads the real workbook, applies the
// docs/DAY6_NORMALIZATION_RULES.md rules (row-collapse, scope triage, slug
// generation, duplicate/relationship candidates) entirely in memory, and
// writes a JSON + Markdown failure/classification report to --out-dir.
//
// Usage:
//   npm run day11:dry-run -- --file /path/to/muizasdb_pic.xlsx \
//     --out-dir docs/day11-dry-run-output [--source-system manasvietas_blogspot]

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { buildCandidateQueues } from "./duplicateCandidates";
import { collapsePost, groupRowsByPost, resolveSlugCollisions } from "./rawDatasetTransform";
import type {
  CollapsedPost,
  DryRunReport,
  RawBlogImageRow,
  ScopeDecision,
  ScopeDecisionBasis,
  ScopeTriage,
} from "./rawDatasetTypes";

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

interface Args {
  file: string;
  outDir: string;
  sourceSystem: string;
}

export function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const file = get("--file");
  const outDir = get("--out-dir");
  if (!file || !outDir) {
    throw new Error("usage: --file <xlsx-path> --out-dir <dir> [--source-system <name>]");
  }
  return {
    file,
    outDir,
    sourceSystem: get("--source-system") ?? "manasvietas_blogspot",
  };
}

/**
 * The displayed/literal text of a cell. For an ExcelJS hyperlink cell
 * (`{ text, hyperlink }`), this is the *displayed* text, not the link
 * target - use that for an ordinary content column (title, address,
 * coordinates, caption, body text), where the cell's own text is the data.
 * Never use this for a URL column; see cellHyperlinkOrText below.
 */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) {
      const richText = (value as { richText: Array<{ text: string }> }).richText;
      return richText.map((t) => t.text).join("");
    }
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text;
    }
    if ("hyperlink" in value && typeof (value as { hyperlink?: unknown }).hyperlink === "string") {
      return (value as { hyperlink: string }).hyperlink;
    }
  }
  return String(value);
}

/**
 * For URL columns only (blog-post URL, Google Drive hyperlink, original
 * image URL): an ExcelJS hyperlink cell's value shape is
 * `{ text, hyperlink }` - both the displayed label and the actual link
 * target. A Day 11 Codex review finding: the previous single cellText()
 * helper checked for a `.text` property before a `.hyperlink` property, so
 * for every hyperlink cell it silently returned the *displayed* text and
 * never reached the hyperlink branch at all - meaning the Drive-file-id
 * extraction downstream (extractDriveFileId) was very often run against
 * friendly display text instead of the real URL, overcounting the
 * content-hash fallback. This returns the hyperlink target when the cell
 * is hyperlink-shaped, falling back to cellText() for a plain (non-
 * hyperlink) cell - including a column that is just typed plain-text URLs
 * with no hyperlink formatting at all. See docs/DAY11_DRY_RUN_NOTES.md
 * decision 11.
 */
export function cellHyperlinkOrText(value: ExcelJS.CellValue): string {
  if (
    value !== null &&
    typeof value === "object" &&
    "hyperlink" in value &&
    typeof (value as { hyperlink?: unknown }).hyperlink === "string"
  ) {
    return (value as { hyperlink: string }).hyperlink;
  }
  return cellText(value);
}

function cellNumberOrNull(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number") return value;
  const text = cellText(value).trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

// 0-based EXPECTED_HEADER indices whose column holds a URL: the blog-post
// URL, the Google Drive hyperlink and the original image URL. These must
// read the cell's hyperlink *target* when the cell is hyperlink-shaped
// (cellHyperlinkOrText), never just its displayed text (cellText) - see
// that function's own doc comment.
const URL_COLUMN_INDICES = new Set([3, 5, 6]);

export async function readWorkbookRows(filePath: string): Promise<RawBlogImageRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("workbook has no sheets");

  const headerRow = sheet.getRow(1);
  const actualHeader = EXPECTED_HEADER.map((_, i) =>
    cellText(headerRow.getCell(i + 1).value).trim(),
  );
  const headerMismatch = EXPECTED_HEADER.some((expected, i) => actualHeader[i] !== expected);
  if (headerMismatch) {
    throw new Error(
      `workbook header does not match the documented 11-column shape from docs/DAY5_COLUMN_MAPPING.md.\n` +
        `expected: ${JSON.stringify(EXPECTED_HEADER)}\nfound:    ${JSON.stringify(actualHeader)}`,
    );
  }

  const rows: RawBlogImageRow[] = [];
  const headerRowText = actualHeader.join("\u0001");
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const values = EXPECTED_HEADER.map((_, i) => {
      const cellValue = row.getCell(i + 1).value;
      return URL_COLUMN_INDICES.has(i) ? cellHyperlinkOrText(cellValue) : cellText(cellValue);
    });
    const allBlank = values.every((v) => v.trim() === "");
    if (allBlank) continue;
    if (values.join("\u0001") === headerRowText) continue; // the known duplicated header row

    rows.push({
      sourceRowNumber: cellNumberOrNull(row.getCell(1).value),
      postId: values[1].trim(),
      title: values[2],
      postUrl: values[3],
      driveFilename: values[4],
      driveUrl: values[5],
      originalImageUrl: values[6],
      address: values[7],
      coordinates: values[8],
      caption: values[9],
      bodyText: values[10],
    });
  }
  return rows;
}

function buildReport(
  sourceFile: string,
  sourceFileSha256: string,
  sourceFileSizeBytes: number,
  totalImageRows: number,
  posts: CollapsedPost[],
  duplicateCandidates: ReturnType<typeof buildCandidateQueues>["duplicateCandidates"],
  relationshipCandidates: ReturnType<typeof buildCandidateQueues>["relationshipCandidates"],
  slugCollisionGroups: number,
): DryRunReport {
  const scopeCounts: Record<ScopeTriage, number> = {
    in_scope_candidate: 0,
    out_of_scope_candidate: 0,
    ambiguous_no_keyword_match: 0,
  };
  const scopeDecisionCounts: Record<ScopeDecision, number> = {
    in_scope: 0,
    archived_out_of_scope: 0,
  };
  const scopeDecisionBasisCounts: Record<ScopeDecisionBasis, number> = {
    title_keyword: 0,
    body_text_affiliation_phrase: 0,
    no_signal_found: 0,
  };
  const proposedStatusCounts: DryRunReport["proposedStatusCounts"] = {
    needs_review: 0,
    archived_out_of_scope: 0,
  };
  const issueFrequency: Record<string, number> = {};
  let missingCoordinatesCount = 0;
  let missingAddressCount = 0;
  let coordinatesOutsideBboxCount = 0;
  let coordinatesUnparsedCount = 0;
  const withinPostVariantCounts = { address: 0, coordinates: 0, bodyText: 0 };
  const sampleIssues: DryRunReport["sampleIssues"] = [];
  const bodyTextReclassifiedSample: DryRunReport["bodyTextReclassifiedSample"] = [];
  const imageIdentitySourceCounts: DryRunReport["imageIdentitySourceCounts"] = {
    drive_file_id: 0,
    original_url: 0,
    content_hash: 0,
  };

  for (const post of posts) {
    for (const image of post.images) {
      imageIdentitySourceCounts[image.externalImageIdSource] += 1;
    }
    scopeCounts[post.scopeTriage] += 1;
    scopeDecisionCounts[post.scopeDecision] += 1;
    scopeDecisionBasisCounts[post.scopeDecisionBasis] += 1;
    proposedStatusCounts[post.proposedStatus] += 1;
    if (
      post.scopeDecisionBasis === "body_text_affiliation_phrase" &&
      bodyTextReclassifiedSample.length < 30 &&
      post.bodyTextAffiliationPhraseMatched
    ) {
      bodyTextReclassifiedSample.push({
        externalSourceId: post.externalSourceId,
        title: post.title,
        phrase: post.bodyTextAffiliationPhraseMatched,
      });
    }
    if (post.coordinates === null) missingCoordinatesCount += 1;
    if (post.address === null) missingAddressCount += 1;
    if (post.coordinatesOutsideLatviaBbox) coordinatesOutsideBboxCount += 1;
    if (post.coordinatesUnparsed) coordinatesUnparsedCount += 1;
    if (post.addressVariantCount > 1) withinPostVariantCounts.address += 1;
    if (post.coordinatesVariantCount > 1) withinPostVariantCounts.coordinates += 1;
    if (post.bodyTextVariantCount > 1) withinPostVariantCounts.bodyText += 1;
    for (const issue of post.issues) {
      const key = issue.split(":")[0]; // group dynamic messages (e.g. quoted unparsed text) by prefix
      issueFrequency[key] = (issueFrequency[key] ?? 0) + 1;
    }
    if (sampleIssues.length < 20 && post.issues.length > 1) {
      sampleIssues.push({
        externalSourceId: post.externalSourceId,
        title: post.title,
        issues: post.issues,
      });
    }
  }

  return {
    sourceFile,
    sourceFileSha256,
    sourceFileSizeBytes,
    generatedAt: new Date().toISOString(),
    totalImageRows,
    totalPosts: posts.length,
    scopeCounts,
    scopeDecisionCounts,
    scopeDecisionBasisCounts,
    proposedStatusCounts,
    issueFrequency,
    missingCoordinatesCount,
    missingAddressCount,
    coordinatesOutsideBboxCount,
    coordinatesUnparsedCount,
    withinPostVariantCounts,
    duplicateCandidates,
    relationshipCandidates,
    slugCollisionGroups,
    sampleIssues,
    bodyTextReclassifiedSample,
    imageIdentitySourceCounts,
  };
}

function renderMarkdown(report: DryRunReport, rowsWithoutPostId: number): string {
  const lines: string[] = [];
  lines.push("# Day 11 dry-run report (generated, not edited by hand)");
  lines.push("");
  lines.push(`Source file: \`${report.sourceFile}\``);
  lines.push(`SHA-256: \`${report.sourceFileSha256}\``);
  lines.push(`Size: ${report.sourceFileSizeBytes} bytes`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(
    `- Total image rows (after dropping the duplicated header row): ${report.totalImageRows}`,
  );
  lines.push(`- Rows with no post id (excluded from grouping): ${rowsWithoutPostId}`);
  lines.push(`- Collapsed posts: ${report.totalPosts}`);
  lines.push("");
  lines.push(
    "## Scope decision (section 1 - a confirmed, reversible decision; see docs/DAY11_DRY_RUN_NOTES.md decision 10)",
  );
  lines.push("");
  lines.push(
    "Every post now has a real in_scope / archived_out_of_scope decision, not just a proposal. " +
      "The title-only keyword scan (raw signal, kept below for audit) is extended by a second pass over each " +
      "post's own body text: a tight phrase-based regex looks for explicit manor-complex-membership language " +
      '(e.g. "muižas komplekss", "piederēja muižai", "bijušās muižas") that the title alone would miss. ' +
      "This is still text-signal-based (title + body only), not a manual review of each post's photos/context, " +
      "and archived_out_of_scope remains a real but reversible decision - the post keeps its stable identity and " +
      "is never deleted.",
  );
  lines.push("");
  lines.push("### Confirmed decision counts");
  lines.push("");
  lines.push(`- in_scope: ${report.scopeDecisionCounts.in_scope}`);
  lines.push(`- archived_out_of_scope: ${report.scopeDecisionCounts.archived_out_of_scope}`);
  lines.push("");
  lines.push("### Decision basis (why each post landed where it did)");
  lines.push("");
  lines.push(
    `- title_keyword (title alone named a manor/palace/castle/hillfort/ruin): ${report.scopeDecisionBasisCounts.title_keyword}`,
  );
  lines.push(
    `- body_text_affiliation_phrase (title didn't, but body text used an explicit manor-affiliation phrase): ${report.scopeDecisionBasisCounts.body_text_affiliation_phrase}`,
  );
  lines.push(
    `- no_signal_found (neither title nor body text gave a signal; archived): ${report.scopeDecisionBasisCounts.no_signal_found}`,
  );
  lines.push("");
  lines.push(
    `### Sample of posts reclassified to in_scope via body-text phrase (${report.bodyTextReclassifiedSample.length} shown)`,
  );
  lines.push("");
  if (report.bodyTextReclassifiedSample.length === 0) {
    lines.push("(none in this run)");
  } else {
    for (const sample of report.bodyTextReclassifiedSample) {
      lines.push(
        `- **${sample.externalSourceId}** "${sample.title}" - matched phrase: "${sample.phrase}"`,
      );
    }
  }
  lines.push("");
  lines.push("### Raw title-only keyword triage (kept for audit/comparison only)");
  lines.push("");
  lines.push(`- in_scope_candidate: ${report.scopeCounts.in_scope_candidate}`);
  lines.push(`- out_of_scope_candidate: ${report.scopeCounts.out_of_scope_candidate}`);
  lines.push(`- ambiguous_no_keyword_match: ${report.scopeCounts.ambiguous_no_keyword_match}`);
  lines.push("");
  lines.push(
    "## Proposed staging status (none of this is written anywhere; derived from the confirmed scope decision above)",
  );
  lines.push("");
  lines.push(`- needs_review: ${report.proposedStatusCounts.needs_review}`);
  lines.push(`- archived_out_of_scope: ${report.proposedStatusCounts.archived_out_of_scope}`);
  lines.push("");
  lines.push("## Field-level findings");
  lines.push("");
  lines.push(
    `- Posts with no resolved coordinates after collapse: ${report.missingCoordinatesCount}`,
  );
  lines.push(`- Posts with no resolved address after collapse: ${report.missingAddressCount}`);
  lines.push(
    `- Posts with coordinates outside the approximate Latvia bounding box: ${report.coordinatesOutsideBboxCount}`,
  );
  lines.push(
    `- Posts with unparseable (non-placeholder) coordinate text: ${report.coordinatesUnparsedCount}`,
  );
  lines.push(
    `- Posts with >1 distinct address value across their own image rows: ${report.withinPostVariantCounts.address}`,
  );
  lines.push(
    `- Posts with >1 distinct coordinate value across their own image rows: ${report.withinPostVariantCounts.coordinates}`,
  );
  lines.push(
    `- Posts with >1 distinct body-text value across their own image rows: ${report.withinPostVariantCounts.bodyText}`,
  );
  lines.push(
    `- Slug base-name collision groups (resolved via location-hint/external-id suffix): ${report.slugCollisionGroups}`,
  );
  lines.push("");
  lines.push(
    "## Per-image identity source (section 6; drive_file_id preferred, original_url then content_hash as fallbacks)",
  );
  lines.push("");
  lines.push(`- drive_file_id: ${report.imageIdentitySourceCounts.drive_file_id}`);
  lines.push(`- original_url: ${report.imageIdentitySourceCounts.original_url}`);
  lines.push(`- content_hash: ${report.imageIdentitySourceCounts.content_hash}`);
  lines.push("");
  lines.push("## Issue frequency (by issue type)");
  lines.push("");
  for (const [issue, count] of Object.entries(report.issueFrequency).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${issue}: ${count}`);
  }
  lines.push("");
  lines.push(
    `## Duplicate candidates (section 4; never auto-merged): ${report.duplicateCandidates.length}`,
  );
  lines.push("");
  lines.push(
    "These need manual review to decide: same object (keep the better-sourced post, archive the other), a parent/child relationship, or two legitimately separate objects.",
  );
  lines.push("");
  for (const dup of report.duplicateCandidates.slice(0, 50)) {
    lines.push(`- [${dup.kind}] ${dup.postA} <-> ${dup.postB}: ${dup.detail}`);
  }
  if (report.duplicateCandidates.length > 50) {
    lines.push(`- ... and ${report.duplicateCandidates.length - 50} more (see the JSON report)`);
  }
  lines.push("");
  lines.push(
    `## Relationship candidates (section 4; within 500m, never auto-linked): ${report.relationshipCandidates.length}`,
  );
  lines.push("");
  for (const rel of report.relationshipCandidates.slice(0, 50)) {
    lines.push(`- ${rel.postA} <-> ${rel.postB}: ${rel.distanceMeters.toFixed(1)}m apart`);
  }
  if (report.relationshipCandidates.length > 50) {
    lines.push(`- ... and ${report.relationshipCandidates.length - 50} more (see the JSON report)`);
  }
  lines.push("");
  lines.push(
    `## Representative sample issues (${report.sampleIssues.length} of ${report.totalPosts} posts)`,
  );
  lines.push("");
  for (const sample of report.sampleIssues) {
    lines.push(`- **${sample.externalSourceId}** "${sample.title}"`);
    for (const issue of sample.issues) lines.push(`  - ${issue}`);
  }
  lines.push("");
  return lines.join("\n");
}

export async function runDryRun(args: Args): Promise<DryRunReport> {
  const fileBuffer = readFileSync(args.file);
  const sourceFileSha256 = createHash("sha256").update(fileBuffer).digest("hex");
  const sourceFileSizeBytes = statSync(args.file).size;

  const allRows = await readWorkbookRows(args.file);
  const rowsWithoutPostId = allRows.filter((r) => r.postId.trim() === "").length;
  const groups = groupRowsByPost(allRows);

  const collapsed = [...groups.entries()].map(([postId, rows]) =>
    collapsePost(postId, rows, { sourceSystem: args.sourceSystem }),
  );

  const slugAssignment = resolveSlugCollisions(
    collapsed.map((p) => ({
      externalSourceId: p.externalSourceId,
      primaryName: p.primaryName,
      locationHint: p.locationHint,
    })),
  );
  const baseSlugCounts = new Map<string, number>();
  for (const post of collapsed) {
    baseSlugCounts.set(post.slug, (baseSlugCounts.get(post.slug) ?? 0) + 1);
  }
  const slugCollisionGroups = [...baseSlugCounts.values()].filter((n) => n > 1).length;
  for (const post of collapsed) {
    post.slug = slugAssignment.get(post.externalSourceId) ?? post.slug;
  }

  const { duplicateCandidates, relationshipCandidates } = buildCandidateQueues(collapsed);

  const report = buildReport(
    basename(args.file),
    sourceFileSha256,
    sourceFileSizeBytes,
    allRows.length,
    collapsed,
    duplicateCandidates,
    relationshipCandidates,
    slugCollisionGroups,
  );

  mkdirSync(args.outDir, { recursive: true });
  writeFileSync(join(args.outDir, "day11-dry-run-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    join(args.outDir, "day11-dry-run-report.md"),
    renderMarkdown(report, rowsWithoutPostId),
  );

  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  runDryRun(args)
    .then((report) => {
      console.log(
        JSON.stringify(
          {
            totalPosts: report.totalPosts,
            scopeCounts: report.scopeCounts,
            proposedStatusCounts: report.proposedStatusCounts,
            duplicateCandidates: report.duplicateCandidates.length,
            relationshipCandidates: report.relationshipCandidates.length,
            reportWrittenTo: args.outDir,
          },
          null,
          2,
        ),
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
