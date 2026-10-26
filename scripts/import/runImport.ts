#!/usr/bin/env node
// Day 10 importer CLI. Reads a CSV shaped like
// data/sample/day4-representative-records.csv, stages every row into
// staging_heritage_objects (batched, idempotent - safe to re-run or resume),
// and optionally promotes whatever reaches ready_for_import into
// heritage_objects via promote_staging_row().
//
// Usage:
//   npm run import -- --file data/sample/day4-representative-records.csv \
//     --source-system day4_representative_sample [--promote] [--force] \
//     [--batch-size 10] [--db-url postgres://...]
//
// Connects via SUPABASE_DB_URL (reserved in .env.example since Day 7) unless
// --db-url overrides it - this is the first script to actually use that
// variable; see docs/DAY10_IMPORTER_NOTES.md.

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import { buildStagingCandidate } from "./parseSample";
import { createPool, promoteReadyRows, statusCounts, upsertBatch } from "./db";
import type { ImportSummary, RawSampleRow } from "./types";

interface Args {
  file: string;
  sourceSystem: string;
  batchSize: number;
  promote: boolean;
  force: boolean;
  dbUrl: string;
}

export function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const file = get("--file");
  const sourceSystem = get("--source-system");
  if (!file || !sourceSystem) {
    throw new Error(
      "usage: --file <csv-path> --source-system <name> [--promote] [--force] [--batch-size N] [--db-url ...]",
    );
  }

  const batchSize = Number(get("--batch-size") ?? "50");
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error("--batch-size must be a positive integer");
  }

  const dbUrl = get("--db-url") ?? process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    throw new Error(
      "no database connection string: pass --db-url or set SUPABASE_DB_URL (see .env.example)",
    );
  }

  return {
    file,
    sourceSystem,
    batchSize,
    promote: has("--promote"),
    force: has("--force"),
    dbUrl,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function main(): Promise<void> {
  // Unlike the Next.js runtime, a standalone tsx script does not load
  // .env.local automatically. Load it before parsing arguments so the
  // documented SUPABASE_DB_URL workflow works without exposing the URL on
  // the command line or committing it to Git.
  if (!process.env.SUPABASE_DB_URL && existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  const args = parseArgs(process.argv.slice(2));

  const fileContents = readFileSync(args.file, "utf8");
  const rawRows: RawSampleRow[] = parse(fileContents, { columns: true, skip_empty_lines: true });

  const candidates = rawRows.map((row) =>
    buildStagingCandidate(row, { sourceSystem: args.sourceSystem }),
  );

  const pool = createPool(args.dbUrl);
  const rowResults: ImportSummary["rows"] = [];
  let skippedUnchanged = 0;

  try {
    for (const batch of chunk(candidates, args.batchSize)) {
      const results = await upsertBatch(pool, batch, { force: args.force });
      for (const result of results) {
        if (result.action === "skipped_unchanged") skippedUnchanged += 1;
        rowResults.push({
          externalSourceId: result.externalSourceId,
          status: result.status,
          statusReason: result.statusReason,
          promotedObjectId: null,
        });
      }
    }

    let promotedCount = 0;
    let deferredCount = 0;
    if (args.promote) {
      const outcome = await promoteReadyRows(pool, args.sourceSystem);
      promotedCount = outcome.promoted.length;
      deferredCount = outcome.deferred.length;
      for (const row of outcome.promoted) {
        const entry = rowResults.find((r) => r.externalSourceId === row.externalSourceId);
        if (entry) {
          entry.status = "imported";
          entry.promotedObjectId = row.objectId;
        }
      }
    }

    const byStatus = await statusCounts(pool, args.sourceSystem);

    const summary: ImportSummary = {
      sourceSystem: args.sourceSystem,
      file: args.file,
      totalRows: rawRows.length,
      staged: candidates.length,
      skippedUnchanged,
      byStatus,
      promoted: promotedCount,
      deferredOnParent: deferredCount,
      rows: rowResults,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
