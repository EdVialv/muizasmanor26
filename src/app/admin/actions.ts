"use server";

import { redirect } from "next/navigation";
import { AuthConfigurationError } from "@/lib/auth/config";
import { SIGN_IN_PATH, safeReturnPath } from "@/lib/auth/returnPath";
import { createAuthServerClient } from "@/lib/auth/serverClient";
import { signInFailureState, validateSignInInput, type SignInFormState } from "@/lib/auth/signIn";

/**
 * Staff sign-in and sign-out (Day 21 - docs/DAY21_AUTH_PERMISSIONS_NOTES.md).
 *
 * Sign-in is e-mail and password for accounts an administrator has already
 * created; there is no sign-up action. Supabase Auth checks the password
 * and @supabase/ssr stores the session in cookies. Signing in does not by
 * itself grant anything: the protected page checks the staff role on every
 * request.
 *
 * Neither action logs or returns credentials or tokens; the only thing
 * logged on failure is the error's status and code.
 */
export async function signInAction(
  _previous: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const input = validateSignInInput(formData.get("email"), formData.get("password"));
  if (!input.ok) {
    return input.state;
  }
  const next = safeReturnPath(formData.get("next"));

  let failure: SignInFormState | null = null;
  try {
    const { client } = await createAuthServerClient();
    const { error } = await client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) {
      console.warn("[admin] sign-in failed:", error.status ?? "-", error.code ?? "-");
      failure = signInFailureState(error, input.email);
    }
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      console.error("[admin] auth is not configured:", error.message);
    } else {
      console.error("[admin] sign-in request failed:", (error as Error)?.name ?? "error");
    }
    failure = signInFailureState({}, input.email);
  }
  if (failure) {
    return failure;
  }
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  try {
    const { client } = await createAuthServerClient();
    // "local": this browser's session only; other devices stay signed in.
    await client.auth.signOut({ scope: "local" });
  } catch (error) {
    console.error("[admin] sign-out request failed:", (error as Error)?.name ?? "error");
  }
  redirect(`${SIGN_IN_PATH}?reason=signed_out`);
}
