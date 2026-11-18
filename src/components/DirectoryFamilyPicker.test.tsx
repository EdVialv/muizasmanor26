import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DirectoryFamilyPicker, { FAMILY_SEARCH_DEBOUNCE_MS } from "./DirectoryFamilyPicker";

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(FAMILY_SEARCH_DEBOUNCE_MS + 10);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("DirectoryFamilyPicker", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is a labelled combobox that loads a bounded list on focus", async () => {
    fetchMock.mockReturnValue(
      jsonResponse({
        options: [
          { value: "Ābele", count: 3 },
          { value: "von Biron", count: 2 },
        ],
        hasMore: false,
      }),
    );
    render(<DirectoryFamilyPicker selected={[]} onSelect={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "Meklēt un pievienot dzimtu" });
    fireEvent.focus(input);
    await settle();

    expect(fetchMock).toHaveBeenCalledWith("/api/directory/families", expect.anything());
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Dzimtas" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ābele (3)" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Atrastas 2 dzimtas.");
  });

  it("uses the Latvian singular for one match", async () => {
    fetchMock.mockReturnValue(
      jsonResponse({ options: [{ value: "Ābele", count: 3 }], hasMore: false }),
    );
    render(<DirectoryFamilyPicker selected={[]} onSelect={vi.fn()} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await settle();
    expect(screen.getByRole("status")).toHaveTextContent("Atrasta 1 dzimta.");
  });

  it("searches what is typed, debounced, and selects with the keyboard", async () => {
    const onSelect = vi.fn();
    fetchMock.mockReturnValue(
      jsonResponse({ options: [{ value: "von der Pahlen", count: 4 }], hasMore: false }),
    );
    render(<DirectoryFamilyPicker selected={[]} onSelect={onSelect} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "p" } });
    fireEvent.change(input, { target: { value: "pāle" } });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/directory/families?q=p%C4%81le");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const option = screen.getByRole("option", { name: "von der Pahlen (4)" });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("von der Pahlen");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("selects with the mouse and hides families already chosen", async () => {
    const onSelect = vi.fn();
    fetchMock.mockReturnValue(
      jsonResponse({
        options: [
          { value: "Ābele", count: 3 },
          { value: "von Biron", count: 2 },
        ],
        hasMore: false,
      }),
    );
    render(<DirectoryFamilyPicker selected={["Ābele"]} onSelect={onSelect} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await settle();

    expect(screen.queryByRole("option", { name: /Ābele/ })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("option", { name: "von Biron (2)" }));
    expect(onSelect).toHaveBeenCalledWith("von Biron");
  });

  it("never lets an older, slower answer replace a newer one", async () => {
    let resolveOld: (value: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveOld = resolve)))
      .mockImplementationOnce(() =>
        jsonResponse({ options: [{ value: "Jaunā", count: 1 }], hasMore: false }),
      );
    render(<DirectoryFamilyPicker selected={[]} onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "ve" } });
    await settle();
    fireEvent.change(input, { target: { value: "jau" } });
    await settle();
    await act(async () => {
      resolveOld({
        ok: true,
        json: () => Promise.resolve({ options: [{ value: "Vecā", count: 1 }], hasMore: false }),
      } as Response);
      await Promise.resolve();
    });

    expect(screen.getByRole("option", { name: "Jaunā (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Vecā/ })).not.toBeInTheDocument();
    // The older request was aborted when the newer one started.
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it("announces no matches, a capped list and a failure", async () => {
    render(<DirectoryFamilyPicker selected={[]} onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox");

    fetchMock.mockReturnValueOnce(jsonResponse({ options: [], hasMore: false }));
    fireEvent.change(input, { target: { value: "zzz" } });
    await settle();
    expect(screen.getByRole("status")).toHaveTextContent("Neviena dzimta neatbilst meklētajam.");

    fetchMock.mockReturnValueOnce(
      jsonResponse({ options: [{ value: "Ābele", count: 1 }], hasMore: true }),
    );
    fireEvent.change(input, { target: { value: "a" } });
    await settle();
    expect(screen.getByRole("status")).toHaveTextContent(/Rādītas pirmās 20 dzimtas/);

    fetchMock.mockReturnValueOnce(jsonResponse({ error: "unavailable" }, false));
    fireEvent.change(input, { target: { value: "ab" } });
    await settle();
    expect(screen.getByRole("status")).toHaveTextContent(/neizdevās ielādēt/);
  });

  it("closes on Escape, then clears the text on a second Escape", async () => {
    fetchMock.mockReturnValue(
      jsonResponse({ options: [{ value: "Ābele", count: 1 }], hasMore: false }),
    );
    render(<DirectoryFamilyPicker selected={[]} onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ā" } });
    await settle();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("ā");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
  });

  it("can be disabled with a reason, e.g. when the family limit is reached", () => {
    render(
      <DirectoryFamilyPicker
        selected={[]}
        onSelect={vi.fn()}
        disabled
        disabledReason="Var izvēlēties līdz 10 dzimtām"
      />,
    );
    const input = screen.getByRole("combobox");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("placeholder", "Var izvēlēties līdz 10 dzimtām");
  });
});
