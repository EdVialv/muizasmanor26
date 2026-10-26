// Database layer for the Day 10 importer: batched, idempotent upserts into
// staging_heritage_objects, and a promotion pass that calls the
// promote_staging_row() SQL function defined in
// supabase/migrations/20261024173045_import_staging.sql, retrying rows
// whose parent has not promoted yet within the same run.

import { Pool, type PoolClient } from "pg";
import type { ImportRowStatus, StagingCandidate } from "./types";

/** SQLSTATE promote_staging_row() raises when a row's parent has not been promoted yet. */
const PARENT_NOT_READY_SQLSTATE = "MM001";

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export interface UpsertResult {
  externalSourceId: string;
  action: "inserted" | "updated" | "skipped_unchanged" | "skipped_already_imported";
  status: ImportRowStatus;
  statusReason: string | null;
}

async function upsertOne(
  client: PoolClient,
  candidate: StagingCandidate,
  force: boolean,
): Promise<UpsertResult> {
  const existing = await client.query<{
    id: string;
    status: ImportRowStatus;
    status_reason: string | null;
    raw_payload_hash: string;
  }>(
    `select id, status, status_reason, raw_payload_hash
       from staging_heritage_objects
      where source_system = $1 and external_source_id = $2`,
    [candidate.source_system, candidate.external_source_id],
  );

  if (existing.rowCount === 0) {
    await client.query(
      `insert into staging_heritage_objects (
         source_system, external_source_id, status, status_reason,
         raw_payload, raw_payload_hash, object_type, parent_external_source_id,
         name_lv, slug, summary_lv, municipality, latitude, longitude,
         source_url, last_verified_at, condition_category, ownership_type,
         ownership_verified_at, historical_owner_families, cadastre_references
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21
       )`,
      [
        candidate.source_system,
        candidate.external_source_id,
        candidate.status,
        candidate.status_reason,
        JSON.stringify(candidate.raw_payload),
        candidate.raw_payload_hash,
        candidate.object_type,
        candidate.parent_external_source_id,
        candidate.name_lv,
        candidate.slug,
        candidate.summary_lv,
        candidate.municipality,
        candidate.latitude,
        candidate.longitude,
        candidate.source_url,
        candidate.last_verified_at,
        candidate.condition_category,
        candidate.ownership_type,
        candidate.ownership_verified_at,
        JSON.stringify(candidate.historical_owner_families),
        JSON.stringify(candidate.cadastre_references),
      ],
    );
    return {
      externalSourceId: candidate.external_source_id,
      action: "inserted",
      status: candidate.status,
      statusReason: candidate.status_reason,
    };
  }

  const row = existing.rows[0];

  if (!force && row.raw_payload_hash === candidate.raw_payload_hash) {
    return {
      externalSourceId: candidate.external_source_id,
      action: "skipped_unchanged",
      status: row.status,
      statusReason: row.status_reason,
    };
  }

  if (row.status === "imported" && !force) {
    // Once a row is imported, heritage_objects (not this staging row) is the
    // live source of truth. A changed source value does not silently
    // re-stage or re-promote it - see docs/DAY10_IMPORTER_NOTES.md decision 5.
    await client.query(
      `update staging_heritage_objects
          set raw_payload = $2,
              raw_payload_hash = $3,
              status_reason = coalesce(status_reason || ' | ', '')
                || 'source row changed after import; re-import not automatic'
        where id = $1 and raw_payload_hash <> $3`,
      [row.id, JSON.stringify(candidate.raw_payload), candidate.raw_payload_hash],
    );
    return {
      externalSourceId: candidate.external_source_id,
      action: "skipped_already_imported",
      status: "imported",
      statusReason: row.status_reason,
    };
  }

  await client.query(
    `update staging_heritage_objects set
       status = $3, status_reason = $4, raw_payload = $5, raw_payload_hash = $6,
       object_type = $7, parent_external_source_id = $8, name_lv = $9, slug = $10,
       summary_lv = $11, municipality = $12, latitude = $13, longitude = $14,
       source_url = $15, last_verified_at = $16, condition_category = $17,
       ownership_type = $18, ownership_verified_at = $19,
       historical_owner_families = $20, cadastre_references = $21
     where id = $1 and source_system = $2`,
    [
      row.id,
      candidate.source_system,
      candidate.status,
      candidate.status_reason,
      JSON.stringify(candidate.raw_payload),
      candidate.raw_payload_hash,
      candidate.object_type,
      candidate.parent_external_source_id,
      candidate.name_lv,
      candidate.slug,
      candidate.summary_lv,
      candidate.municipality,
      candidate.latitude,
      candidate.longitude,
      candidate.source_url,
      candidate.last_verified_at,
      candidate.condition_category,
      candidate.ownership_type,
      candidate.ownership_verified_at,
      JSON.stringify(candidate.historical_owner_families),
      JSON.stringify(candidate.cadastre_references),
    ],
  );
  return {
    externalSourceId: candidate.external_source_id,
    action: "updated",
    status: candidate.status,
    statusReason: candidate.status_reason,
  };
}

/** Upserts one batch inside a single transaction, so a batch commits or rolls back as a unit. */
export async function upsertBatch(
  pool: Pool,
  candidates: StagingCandidate[],
  options: { force: boolean },
): Promise<UpsertResult[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const results: UpsertResult[] = [];
    for (const candidate of candidates) {
      results.push(await upsertOne(client, candidate, options.force));
    }
    await client.query("commit");
    return results;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface PromotionOutcome {
  promoted: Array<{ externalSourceId: string; objectId: string }>;
  deferred: string[];
}

/**
 * Promotes every ready_for_import row for one source_system, retrying rows
 * deferred on an unpromoted parent until a full pass makes no further
 * progress (a simple fixed-point loop - batches here are small enough that
 * this is not worth optimising into a true topological sort).
 */
export async function promoteReadyRows(
  pool: Pool,
  sourceSystem: string,
): Promise<PromotionOutcome> {
  const promoted: Array<{ externalSourceId: string; objectId: string }> = [];
  let remaining = (
    await pool.query<{ id: string; external_source_id: string }>(
      `select id, external_source_id from staging_heritage_objects
        where source_system = $1 and status = 'ready_for_import'
        order by external_source_id`,
      [sourceSystem],
    )
  ).rows;

  let madeProgress = true;
  while (remaining.length > 0 && madeProgress) {
    madeProgress = false;
    const stillRemaining: typeof remaining = [];

    for (const row of remaining) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await client.query<{ promote_staging_row: string }>(
          "select promote_staging_row($1)",
          [row.id],
        );
        await client.query("commit");
        promoted.push({
          externalSourceId: row.external_source_id,
          objectId: result.rows[0].promote_staging_row,
        });
        madeProgress = true;
      } catch (error) {
        await client.query("rollback");
        if (isParentNotReadyError(error)) {
          stillRemaining.push(row);
        } else {
          throw error;
        }
      } finally {
        client.release();
      }
    }

    remaining = stillRemaining;
  }

  return { promoted, deferred: remaining.map((row) => row.external_source_id) };
}

function isParentNotReadyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === PARENT_NOT_READY_SQLSTATE
  );
}

export async function statusCounts(
  pool: Pool,
  sourceSystem: string,
): Promise<Record<ImportRowStatus, number>> {
  const result = await pool.query<{ status: ImportRowStatus; count: string }>(
    `select status, count(*) as count
       from staging_heritage_objects
      where source_system = $1
      group by status`,
    [sourceSystem],
  );
  const counts: Record<ImportRowStatus, number> = {
    archived_out_of_scope: 0,
    needs_review: 0,
    ready_for_import: 0,
    imported: 0,
  };
  for (const row of result.rows) {
    counts[row.status] = Number(row.count);
  }
  return counts;
}
