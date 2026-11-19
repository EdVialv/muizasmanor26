import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffSession } from "@/lib/auth/session";

const { access, redirect } = vi.hoisted(() => ({
  access: { session: null as unknown },
  redirect: vi.fn((href: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { href });
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/staffAccess", () => ({
  loadStaffAccess: async () => ({ session: access.session, client: null }),
}));
vi.mock("../actions", () => ({ signOutAction: vi.fn(), signInAction: vi.fn() }));

import SignInPage from "./page";

async function renderWith(session: StaffSession, params: Record<string, string> = {}) {
  access.session = session;
  render(await SignInPage({ searchParams: Promise.resolve(params) }));
}

describe("/admin/sign-in (Day 21)", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("offers e-mail and password sign-in, and no sign-up", async () => {
    await renderWith({ kind: "anonymous", expired: false });
    expect(screen.getByLabelText("E-pasta adrese")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Parole")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Pieteikties" })).toBeInTheDocument();
    expect(screen.queryByText(/reģistr|izveidot kontu|sign up/i)).toBeNull();
  });

  it("keeps only a safe return path in the form", async () => {
    await renderWith({ kind: "anonymous", expired: false }, { next: "/admin/objects" });
    expect(document.querySelector('input[name="next"]')).toHaveValue("/admin/objects");
  });

  it.each(["https://evil.example/", "//evil.example", "/objects"])(
    "replaces the unsafe return path %s with /admin",
    async (next) => {
      await renderWith({ kind: "anonymous", expired: false }, { next });
      expect(document.querySelector('input[name="next"]')).toHaveValue("/admin");
    },
  );

  it("explains an expired session", async () => {
    await renderWith({ kind: "anonymous", expired: false }, { reason: "expired" });
    expect(screen.getByText(/sesija ir beigusies/)).toHaveAttribute("role", "status");
  });

  it("explains a sign-out", async () => {
    await renderWith({ kind: "anonymous", expired: false }, { reason: "signed_out" });
    expect(screen.getByText(/esat izrakstījies/)).toHaveAttribute("role", "status");
  });

  it("notices an expired session cookie even without a reason", async () => {
    await renderWith({ kind: "anonymous", expired: true });
    expect(screen.getByText(/sesija ir beigusies/)).toHaveAttribute("role", "status");
  });

  it("sends signed-in staff straight to the (safe) return path", async () => {
    await expect(
      renderWith(
        { kind: "staff", userId: "u", email: null, role: "editor" },
        { next: "https://evil.example/" },
      ),
    ).rejects.toMatchObject({ href: "/admin" });
  });

  it("tells a signed-in non-staff user they have no access, with a way to sign out", async () => {
    await renderWith({ kind: "not_staff", userId: "u", email: "lietotajs@example.invalid" });
    expect(screen.getByText(/nav darbinieka piekļuves/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Izrakstīties" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Parole")).toBeNull();
  });
});
