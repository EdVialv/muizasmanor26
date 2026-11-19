"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { INITIAL_SIGN_IN_STATE, MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/auth/signIn";
import type { SignInFormState } from "@/lib/auth/signIn";

export interface SignInFormProps {
  action: (previous: SignInFormState, formData: FormData) => Promise<SignInFormState>;
  /** The validated protected path to return to after signing in. */
  next: string;
}

/**
 * The staff sign-in form (Day 21). A plain POST form to a server action:
 * it works without JavaScript; with JavaScript it shows a pending state
 * and keeps the e-mail address after an error. Errors are tied to their
 * fields (aria-invalid, aria-describedby) and summarised in an alert that
 * receives focus. The password is never put back into the form.
 */
export default function SignInForm({ action, next }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_SIGN_IN_STATE);
  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "error") {
      alertRef.current?.focus();
    }
  }, [state]);

  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form className="adminSignInForm" action={formAction} noValidate aria-busy={pending}>
      {state.status === "error" && state.message ? (
        <p ref={alertRef} className="adminFormAlert" role="alert" tabIndex={-1}>
          {state.message}
        </p>
      ) : null}
      <input type="hidden" name="next" value={next} />

      <div className="adminField">
        <label htmlFor={emailId}>E-pasta adrese</label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          maxLength={MAX_EMAIL_LENGTH}
          defaultValue={state.email ?? ""}
          key={`email-${state.email ?? ""}`}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? emailErrorId : undefined}
          disabled={pending}
        />
        {emailError ? (
          <p id={emailErrorId} className="adminFieldError">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="adminField">
        <label htmlFor={passwordId}>Parole</label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={MAX_PASSWORD_LENGTH}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? passwordErrorId : undefined}
          disabled={pending}
        />
        {passwordError ? (
          <p id={passwordErrorId} className="adminFieldError">
            {passwordError}
          </p>
        ) : null}
      </div>

      <button type="submit" className="primaryAction" disabled={pending}>
        {pending ? "Piesakās…" : "Pieteikties"}
      </button>
      <p className="visuallyHidden" role="status" aria-live="polite">
        {pending ? "Notiek pieteikšanās…" : ""}
      </p>
    </form>
  );
}
