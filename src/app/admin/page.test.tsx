import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffSession } from "@/lib/auth/session";

const { access, overview, redirect } = vi.hoisted(() => ({
  access: { session: null as unknown, client: {} as unknown },
  overview: {
    objects: vi.fn(),
    staff: vi.fn(),
  },
  redirect: vi.fn((href: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { href });
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/staffAccess", () => ({
  loadStaffAccess: async () => ({ session: access.session, client: access.client }),
}));
vi.mock("@/lib/auth/adminOverview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/adminOverview")>()),
  loadObjectStatusCounts: overview.objects,
  loadStaffCounts: overview.staff,
}));
vi.mock("./actions", () => ({ signOutAction: vi.fn(), signInAction: vi.fn() }));

import AdminPage from "./page";

async function renderAs(session: StaffSession) {
  access.session = session;
  render(await AdminPage());
}

describe("/admin (Day 21)", () => {
  beforeEach(() => {
    redirect.mockClear();
    overview.objects
      .mockReset()
      .mockResolvedValue({ draft: 12, review: 3, published: 891, archived: 1 });
    overview.staff.mockReset().mockResolvedValue({ editor: 4, administrator: 2 });
  });

  it("sends anonymous visitors to sign in, and says when a session expired", async () => {
    await expect(renderAs({ kind: "anonymous", expired: false })).rejects.toMatchObject({
      href: "/admin/sign-in",
    });
    await expect(renderAs({ kind: "anonymous", expired: true })).rejects.toMatchObject({
      href: "/admin/sign-in?reason=expired",
    });
    expect(overview.objects).not.toHaveBeenCalled();
  });

  it("denies a signed-in user without a staff role, and loads nothing", async () => {
    await renderAs({ kind: "not_staff", userId: "u", email: "lietotajs@example.invalid" });
    expect(screen.getByRole("heading", { level: 1, name: "Piekļuve liegta" })).toBeInTheDocument();
    expect(screen.getByText("lietotajs@example.invalid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Izrakstīties" })).toBeInTheDocument();
    expect(overview.objects).not.toHaveBeenCalled();
    expect(overview.staff).not.toHaveBeenCalled();
  });

  it("denies when the role cannot be verified", async () => {
    await renderAs({ kind: "unverified" });
    expect(screen.getByRole("alert")).toHaveTextContent("Piekļuvi nevarēja pārbaudīt");
    expect(overview.objects).not.toHaveBeenCalled();
  });

  it("shows an editor their role and the content overview, but not staff figures", async () => {
    await renderAs({
      kind: "staff",
      userId: "u",
      email: "redaktors@example.invalid",
      role: "editor",
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "Darbinieku sadaļa" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Redaktors")).toBeInTheDocument();
    const content = screen.getByRole("region", { name: "Saturs" });
    expect(within(content).getByText("Melnraksti").nextSibling).toHaveTextContent("12");
    expect(within(content).getByText("Publicēti").nextSibling).toHaveTextContent("891");
    expect(screen.queryByRole("region", { name: "Darbinieku piekļuve" })).toBeNull();
    expect(overview.staff).not.toHaveBeenCalled();
  });

  it("shows an administrator the staff figures too (read-only)", async () => {
    await renderAs({ kind: "staff", userId: "u", email: null, role: "administrator" });
    expect(screen.getByText("Administrators")).toBeInTheDocument();
    const staff = screen.getByRole("region", { name: "Darbinieku piekļuve" });
    expect(within(staff).getByText("Redaktori").nextSibling).toHaveTextContent("4");
    expect(within(staff).queryByRole("button", { name: /piešķirt|mainīt|dzēst/i })).toBeNull();
  });

  it("says when the overview could not be loaded, without hiding the page", async () => {
    overview.objects.mockResolvedValue(null);
    await renderAs({ kind: "staff", userId: "u", email: null, role: "editor" });
    expect(screen.getByRole("status")).toHaveTextContent("neizdevās ielādēt");
  });
});
