import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SignInFormState } from "@/lib/auth/signIn";
import SignInForm from "./SignInForm";

describe("SignInForm (Day 21)", () => {
  it("shows field errors tied to their inputs, an alert that takes focus, and keeps only the e-mail", async () => {
    const action = vi.fn(async (): Promise<SignInFormState> => ({
      status: "error",
      message: "Lūdzu, izlabojiet atzīmētos laukus.",
      fieldErrors: { email: "Ievadiet derīgu e-pasta adresi, piemēram, vards@example.lv." },
      email: "nav-epasts",
    }));
    render(<SignInForm action={action} next="/admin" />);
    fireEvent.change(screen.getByLabelText("Parole"), { target: { value: "secret" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pieteikties" }));
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("izlabojiet");
    expect(document.activeElement).toBe(alert);
    const email = screen.getByLabelText("E-pasta adrese");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription(/derīgu e-pasta adresi/);
    expect(email).toHaveValue("nav-epasts");
    expect(screen.getByLabelText("Parole")).toHaveValue("");
  });

  it("carries the validated return path", () => {
    render(<SignInForm action={vi.fn()} next="/admin/objects" />);
    expect(document.querySelector('input[name="next"]')).toHaveValue("/admin/objects");
  });
});
