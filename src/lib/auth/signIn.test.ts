import { describe, expect, it } from "vitest";
import { signInFailureState, validateSignInInput } from "./signIn";

describe("sign-in input (Day 21)", () => {
  it("accepts a trimmed e-mail address and any non-empty password", () => {
    expect(validateSignInInput("  redaktors@example.lv ", " secret ")).toEqual({
      ok: true,
      email: "redaktors@example.lv",
      password: " secret ",
    });
  });

  it("reports missing and malformed fields, keeping the e-mail but never the password", () => {
    const missing = validateSignInInput("", "");
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.state.fieldErrors).toEqual({
        email: "Ievadiet e-pasta adresi.",
        password: "Ievadiet paroli.",
      });
    }
    const malformed = validateSignInInput("not-an-email", "x");
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.state.fieldErrors?.email).toMatch(/derīgu e-pasta/);
      expect(malformed.state.email).toBe("not-an-email");
      expect(JSON.stringify(malformed.state)).not.toContain('"x"');
    }
    expect(validateSignInInput(null, null).ok).toBe(false);
    expect(validateSignInInput("a@b.lv", "p".repeat(2000)).ok).toBe(false);
  });

  it("never says whether the account exists", () => {
    const wrong = signInFailureState({ status: 400, code: "invalid_credentials" }, "a@b.lv");
    const unknown = signInFailureState({ status: 400, code: "user_not_found" }, "a@b.lv");
    expect(wrong.message).toBe("Nepareiza e-pasta adrese vai parole.");
    expect(unknown.message).toBe(wrong.message);
  });

  it("explains rate limits and outages", () => {
    expect(signInFailureState({ status: 429 }, "a@b.lv").message).toMatch(/Pārāk daudz/);
    expect(signInFailureState({ status: 503 }, "a@b.lv").message).toMatch(/nav pieejams/);
    expect(signInFailureState({}, "a@b.lv").message).toMatch(/nav pieejams/);
  });
});
