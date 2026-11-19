/**
 * The figures on the staff home page (Day 21), read with the signed-in
 * user's own client, so Row Level Security decides what they include:
 * staff see objects in every status (policy heritage_objects_select_staff);
 * only administrators see every staff row (staff_members_select_by_administrators).
 * An editor asking for staff figures gets just their own row back, so the
 * page asks only when the role allows it - and the database would refuse
 * to say more anyway.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRole } from "./roles";

export const OBJECT_STATUSES = ["draft", "review", "published", "archived"] as const;
export type ObjectStatus = (typeof OBJECT_STATUSES)[number];

export const OBJECT_STATUS_LABELS: Record<ObjectStatus, string> = {
  draft: "Melnraksti",
  review: "Pārskatīšanā",
  published: "Publicēti",
  archived: "Arhivēti",
};

export type ObjectStatusCounts = Record<ObjectStatus, number>;
export type StaffCounts = Record<StaffRole, number>;

export async function loadObjectStatusCounts(
  client: SupabaseClient,
): Promise<ObjectStatusCounts | null> {
  const results = await Promise.all(
    OBJECT_STATUSES.map((status) =>
      client
        .from("heritage_objects")
        .select("id", { count: "exact", head: true })
        .eq("status", status),
    ),
  );
  if (results.some((result) => result.error || typeof result.count !== "number")) {
    return null;
  }
  return Object.fromEntries(
    OBJECT_STATUSES.map((status, index) => [status, results[index].count as number]),
  ) as ObjectStatusCounts;
}

export async function loadStaffCounts(client: SupabaseClient): Promise<StaffCounts | null> {
  const results = await Promise.all(
    (["editor", "administrator"] as const).map((role) =>
      client
        .from("staff_members")
        .select("user_id", { count: "exact", head: true })
        .eq("role", role),
    ),
  );
  if (results.some((result) => result.error || typeof result.count !== "number")) {
    return null;
  }
  return { editor: results[0].count as number, administrator: results[1].count as number };
}
