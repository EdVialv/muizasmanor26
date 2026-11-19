import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, redirect } = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  redirect: vi.fn((href: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { href });
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/serverClient", () => ({
  createAuthServerClient: async () => ({ client: { auth }, hadSessionCookie: false }),
}));

import { signInAction, signOutAction } from "./actions";
import { INITIAL_SIGN_IN_STATE } from "@/lib/auth/signIn";

const PASSWORD = "correct horse battery staple";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectTarget(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { href: string }).href;
  }
  throw new Error("expected a redirect");
}

describe("staff sign-in and sign-out actions (Day 21)", () => {
  const logged: unknown[][] = [];
  beforeEach(() => {
    auth.signInWithPassword.mockReset();
    auth.signOut.mockReset();
    redirect.mockClear();
    logged.length = 0;
    for (const level of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args) => {
        logged.push(args);
      });
    }
  });
  afterEach(() => vi.restoreAllMocks());

  it("validates before calling Supabase", async () => {
    const state = await signInAction(INITIAL_SIGN_IN_STATE, form({ email: "", password: "" }));
    expect(state.status).toBe("error");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs in and returns to a safe protected page", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    const href = await redirectTarget(
      signInAction(
        INITIAL_SIGN_IN_STATE,
        form({ email: "redaktors@example.invalid", password: PASSWORD, next: "/admin/objects" }),
      ),
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "redaktors@example.invalid",
      password: PASSWORD,
    });
    expect(href).toBe("/admin/objects");
  });

  it("never follows an unsafe return URL", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    for (const next of ["https://evil.example/", "//evil.example", "/objects", "/\\evil"]) {
      const href = await redirectTarget(
        signInAction(
          INITIAL_SIGN_IN_STATE,
          form({ email: "redaktors@example.invalid", password: PASSWORD, next }),
        ),
      );
      expect(href).toBe("/admin");
    }
  });

  it("gives one generic message for a wrong password or unknown account, and logs no credentials", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" },
    });
    const state = await signInAction(
      INITIAL_SIGN_IN_STATE,
      form({ email: "redaktors@example.invalid", password: PASSWORD }),
    );
    expect(state).toEqual({
      status: "error",
      message: "Nepareiza e-pasta adrese vai parole.",
      email: "redaktors@example.invalid",
    });
    expect(redirect).not.toHaveBeenCalled();
    const text = JSON.stringify(logged);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain("redaktors@example.invalid");
  });

  it("treats an unreachable auth service as a failure, not a success", async () => {
    auth.signInWithPassword.mockRejectedValue(new TypeError("fetch failed"));
    const state = await signInAction(
      INITIAL_SIGN_IN_STATE,
      form({ email: "redaktors@example.invalid", password: PASSWORD }),
    );
    expect(state.message).toMatch(/nav pieejams/);
    expect(JSON.stringify(logged)).not.toContain(PASSWORD);
  });

  it("signs out this browser's session and says so", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    const href = await redirectTarget(signOutAction());
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(href).toBe("/admin/sign-in?reason=signed_out");
  });
});
