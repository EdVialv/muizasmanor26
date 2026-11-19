import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/admin/SignOutButton";
import {
  OBJECT_STATUSES,
  OBJECT_STATUS_LABELS,
  loadObjectStatusCounts,
  loadStaffCounts,
} from "@/lib/auth/adminOverview";
import { ADMIN_HOME, signInHref } from "@/lib/auth/returnPath";
import { STAFF_ROLE_LABELS, hasPermission } from "@/lib/auth/roles";
import { loadStaffAccess } from "@/lib/auth/staffAccess";

/**
 * /admin - the staff entry page (Day 21 - docs/DAY21_AUTH_PERMISSIONS_NOTES.md).
 *
 * Checks the session and the role itself on every request:
 * - not signed in (or the session expired): to the sign-in page, which
 *   returns here afterwards;
 * - signed in without a staff role: an access-denied page;
 * - the role cannot be verified: a "not available" page - never access;
 * - editor / administrator: their role and the content overview. The
 *   figures are read under the user's own Row Level Security permissions.
 *
 * No editing yet: object forms are Day 22, publication Day 23.
 */
export default async function AdminPage() {
  const { session, client } = await loadStaffAccess();

  if (session.kind === "anonymous") {
    redirect(signInHref(ADMIN_HOME, session.expired ? "expired" : undefined));
  }

  if (session.kind === "unverified") {
    return (
      <div className="adminPanel" role="alert">
        <p className="eyebrow">Administrēšana</p>
        <h1 className="adminHeading">Piekļuvi nevarēja pārbaudīt</h1>
        <p>
          Šobrīd nevarējām pārbaudīt jūsu piekļuves tiesības, tāpēc administrēšanas sadaļa netiek
          rādīta. Lūdzu, mēģiniet vēlreiz vēlāk.
        </p>
        <SignOutButton />
      </div>
    );
  }

  if (session.kind === "not_staff") {
    return (
      <div className="adminPanel">
        <p className="eyebrow">Administrēšana</p>
        <h1 className="adminHeading">Piekļuve liegta</h1>
        <p>
          Jūs esat pieteicies
          {session.email ? (
            <>
              {" "}
              kā <strong>{session.email}</strong>
            </>
          ) : null}
          , taču jums nav darbinieka piekļuves. Ja jums tā ir nepieciešama, sazinieties ar
          administratoru.
        </p>
        <p>
          <Link href="/">Atgriezties uz sākumlapu</Link>
        </p>
        <SignOutButton />
      </div>
    );
  }

  const objectCounts = client ? await loadObjectStatusCounts(client) : null;
  const staffCounts =
    client && hasPermission(session.role, "staff.read") ? await loadStaffCounts(client) : null;

  return (
    <div className="adminDashboard">
      <header className="adminHeader">
        <div>
          <p className="eyebrow">Administrēšana</p>
          <h1 className="adminHeading">Darbinieku sadaļa</h1>
          <p className="adminIdentity">
            {session.email ? <>{session.email} · </> : null}
            <span className="adminRoleBadge">{STAFF_ROLE_LABELS[session.role]}</span>
          </p>
        </div>
        <SignOutButton />
      </header>

      <section className="adminPanel" aria-labelledby="admin-content-heading">
        <h2 id="admin-content-heading">Saturs</h2>
        {objectCounts ? (
          <dl className="adminStats">
            {OBJECT_STATUSES.map((status) => (
              <div key={status}>
                <dt>{OBJECT_STATUS_LABELS[status]}</dt>
                <dd>{objectCounts[status]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p role="status">Satura pārskatu šobrīd neizdevās ielādēt.</p>
        )}
        <p className="adminNote">
          Objektu rediģēšana un publicēšana vēl nav pieejama — tā tiks pievienota nākamajos
          izstrādes posmos.
        </p>
      </section>

      {hasPermission(session.role, "staff.read") ? (
        <section className="adminPanel" aria-labelledby="admin-staff-heading">
          <h2 id="admin-staff-heading">Darbinieku piekļuve</h2>
          {staffCounts ? (
            <dl className="adminStats">
              <div>
                <dt>Administratori</dt>
                <dd>{staffCounts.administrator}</dd>
              </div>
              <div>
                <dt>Redaktori</dt>
                <dd>{staffCounts.editor}</dd>
              </div>
            </dl>
          ) : (
            <p role="status">Darbinieku pārskatu šobrīd neizdevās ielādēt.</p>
          )}
          <p className="adminNote">
            Lomas piešķir un atsauc tikai uzticams administrators datubāzē; šeit tās var tikai
            apskatīt.
          </p>
        </section>
      ) : null}
    </div>
  );
}
