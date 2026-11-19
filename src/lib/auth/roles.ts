/**
 * Staff roles and what each may do (Day 21 - docs/DAY21_AUTH_PERMISSIONS_NOTES.md).
 *
 * The role itself always comes from the database (public.staff_members,
 * read under the user's own Row Level Security permissions). This module
 * only validates what the database returned and describes the permission
 * matrix; it never decides who *has* a role. Anything that is not exactly
 * one of the known roles is treated as no role.
 *
 * The matrix lists Day 22 and Day 23 permissions so that their interfaces
 * have one place to ask; the database policies that enforce them arrive
 * with those days. Until then the only staff permission that exists is
 * "admin.access" (and reading every object status).
 */

export const STAFF_ROLES = ["editor", "administrator"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  editor: "Redaktors",
  administrator: "Administrators",
};

export type StaffPermission =
  /** Day 21: open /admin and read objects in every status. */
  | "admin.access"
  /** Day 22: create and edit objects (drafts). */
  | "objects.edit"
  /** Day 23: submit a draft for review. */
  | "objects.submit_for_review"
  /** Day 23: publish, unpublish and archive. */
  | "objects.publish"
  /** Later: see and manage staff access (roles stay SQL-provisioned until then). */
  | "staff.read";

const PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  editor: ["admin.access", "objects.edit", "objects.submit_for_review"],
  administrator: [
    "admin.access",
    "objects.edit",
    "objects.submit_for_review",
    "objects.publish",
    "staff.read",
  ],
};

export function parseStaffRole(value: unknown): StaffRole | null {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value)
    ? (value as StaffRole)
    : null;
}

export function hasPermission(role: StaffRole | null, permission: StaffPermission): boolean {
  return role !== null && PERMISSIONS[role].includes(permission);
}
