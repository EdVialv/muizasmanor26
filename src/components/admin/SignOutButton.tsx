import { signOutAction } from "@/app/admin/actions";

/** Sign-out is a POST (a server action), so a link or prefetch can never sign anyone out. */
export default function SignOutButton() {
  return (
    <form action={signOutAction} className="adminSignOut">
      <button type="submit" className="adminSecondaryAction">
        Izrakstīties
      </button>
    </form>
  );
}
