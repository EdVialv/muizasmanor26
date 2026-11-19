import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignInForm from "@/components/admin/SignInForm";
import SignOutButton from "@/components/admin/SignOutButton";
import { safeReturnPath } from "@/lib/auth/returnPath";
import { loadStaffAccess } from "@/lib/auth/staffAccess";
import { signInAction } from "../actions";

export const metadata: Metadata = {
  title: "Pieteikties",
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * /admin/sign-in (Day 21). Staff accounts are created by an administrator;
 * there is deliberately no sign-up link or form. `next` is validated
 * (safeReturnPath) before it is used anywhere; `reason` only selects a
 * fixed notice.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(single(params.next));
  const reason = single(params.reason);
  const { session } = await loadStaffAccess();

  if (session.kind === "staff") {
    redirect(next);
  }

  const expired =
    reason === "expired" || (session.kind === "anonymous" && session.expired && !reason);

  return (
    <div className="adminSignIn">
      <p className="eyebrow">Darbiniekiem</p>
      <h1 className="adminHeading">Pieteikties</h1>
      <p className="adminLead">
        Administrēšanas sadaļa ir pieejama tikai muižu kataloga darbiniekiem. Kontus izveido
        administrators.
      </p>

      {expired ? (
        <p className="adminNotice" role="status">
          Jūsu sesija ir beigusies. Lūdzu, piesakieties vēlreiz.
        </p>
      ) : reason === "signed_out" ? (
        <p className="adminNotice" role="status">
          Jūs esat izrakstījies.
        </p>
      ) : null}

      {session.kind === "not_staff" ? (
        <div className="adminNotice" role="status">
          <p>
            Jūs esat pieteicies{session.email ? ` kā ${session.email}` : ""}, taču jums nav
            darbinieka piekļuves.
          </p>
          <SignOutButton />
        </div>
      ) : (
        <>
          {session.kind === "unverified" ? (
            <p className="adminNotice" role="status">
              Pieteikšanās šobrīd var nedarboties: piekļuves pārbaude nav pieejama.
            </p>
          ) : null}
          <SignInForm action={signInAction} next={next} />
        </>
      )}
    </div>
  );
}
