/**
 * Sign-in input validation and outcome mapping (Day 21). Pure, so the
 * server action stays thin and this is unit-tested directly.
 *
 * Failure messages never say whether the e-mail address exists or whether
 * its account is confirmed (one generic message covers both), and
 * nothing here logs or returns the password.
 */

export const MAX_EMAIL_LENGTH = 254;
export const MAX_PASSWORD_LENGTH = 1024;

export interface SignInFormState {
  status: "idle" | "error";
  /** Shown above the form (role="alert"). */
  message?: string;
  fieldErrors?: { email?: string; password?: string };
  /** The e-mail address to put back in the field - never the password. */
  email?: string;
}

export const INITIAL_SIGN_IN_STATE: SignInFormState = { status: "idle" };

export const GENERIC_FAILURE_MESSAGE = "Nepareiza e-pasta adrese vai parole.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignInInput =
  { ok: true; email: string; password: string } | { ok: false; state: SignInFormState };

export function validateSignInInput(emailRaw: unknown, passwordRaw: unknown): SignInInput {
  const email = typeof emailRaw === "string" ? emailRaw.trim() : "";
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  const fieldErrors: SignInFormState["fieldErrors"] = {};
  if (!email) {
    fieldErrors.email = "Ievadiet e-pasta adresi.";
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email)) {
    fieldErrors.email = "Ievadiet derīgu e-pasta adresi, piemēram, vards@example.lv.";
  }
  if (!password) {
    fieldErrors.password = "Ievadiet paroli.";
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.password = "Parole ir pārāk gara.";
  }
  if (fieldErrors.email || fieldErrors.password) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Lūdzu, izlabojiet atzīmētos laukus.",
        fieldErrors,
        email: email.slice(0, MAX_EMAIL_LENGTH),
      },
    };
  }
  return { ok: true, email, password };
}

/** A Supabase Auth error, reduced to what the visitor may be told. */
export function signInFailureState(
  error: { status?: number; code?: string } | null,
  email: string,
): SignInFormState {
  if (error?.status === 429 || error?.code === "over_request_rate_limit") {
    return {
      status: "error",
      message: "Pārāk daudz mēģinājumu. Lūdzu, pagaidiet dažas minūtes un mēģiniet vēlreiz.",
      email,
    };
  }
  if (error && (error.status === undefined || error.status >= 500)) {
    return {
      status: "error",
      message: "Pieteikšanās pakalpojums šobrīd nav pieejams. Lūdzu, mēģiniet vēlāk.",
      email,
    };
  }
  // Everything else that depends on the account - a wrong password, an
  // unknown address, an unconfirmed address (email_not_confirmed), a banned
  // user - gets the same message, so the form never reveals which addresses
  // have accounts or what state they are in.
  return {
    status: "error",
    message: GENERIC_FAILURE_MESSAGE,
    email,
  };
}
