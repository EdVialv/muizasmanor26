"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  FAMILY_OPTIONS_LIMIT,
  familyOptionsHref,
  parseFamilyOptionsResponse,
  type FamilyOption,
} from "@/lib/directory/familyOptions";

export const FAMILY_SEARCH_DEBOUNCE_MS = 250;

/** Latvian agreement: 1, 21, 31 … take the singular (but 11 does not). */
function foundMessage(count: number): string {
  const singular = count % 10 === 1 && count % 100 !== 11;
  return singular ? `Atrasta ${count} dzimta.` : `Atrastas ${count} dzimtas.`;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; options: FamilyOption[]; hasMore: boolean }
  | { kind: "error" };

/**
 * A searchable family selector (docs/DAY18_CLASSIFICATION_FILTERS_NOTES.md),
 * following the WAI-ARIA combobox-with-listbox pattern:
 *
 * - typing (debounced) asks the server for at most 20 matching names - the
 *   whole family list is never loaded into the browser;
 * - only the newest request is shown: older ones are aborted, and a late
 *   answer to an aborted or superseded request is ignored;
 * - ArrowDown/ArrowUp move through the options, Enter adds the active one,
 *   Escape closes the list (or clears the text when already closed);
 * - every state - loading, nothing found, more than 20, failed - is also
 *   announced in a polite live region.
 */
export default function DirectoryFamilyPicker({
  selected,
  onSelect,
  disabled,
  disabledReason,
}: {
  selected: readonly string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const inputId = useId();
  const listboxId = useId();
  const hintId = useId();
  const statusId = useId();

  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [activeIndex, setActiveIndex] = useState(-1);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      controllerRef.current?.abort();
    },
    [],
  );

  const options =
    state.kind === "ready"
      ? state.options.filter((option) => !selected.includes(option.value))
      : [];

  function load(search: string) {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const request = ++requestRef.current;
      setState({ kind: "loading" });
      fetch(familyOptionsHref(search), { signal: controller.signal })
        .then(async (response) => {
          const parsed = response.ok ? parseFamilyOptionsResponse(await response.json()) : null;
          if (request !== requestRef.current) {
            return;
          }
          setState(
            parsed
              ? { kind: "ready", options: parsed.options, hasMore: parsed.hasMore }
              : { kind: "error" },
          );
          setActiveIndex(-1);
        })
        .catch((error: unknown) => {
          if (request !== requestRef.current || (error as Error)?.name === "AbortError") {
            return;
          }
          setState({ kind: "error" });
        });
    }, FAMILY_SEARCH_DEBOUNCE_MS);
  }

  function openList() {
    if (!open) {
      setOpen(true);
      if (state.kind === "idle" || state.kind === "error") {
        load(text);
      }
    }
  }

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function choose(option: FamilyOption) {
    onSelect(option.value);
    setText("");
    close();
    // The next opening lists from the start again.
    setState({ kind: "idle" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          openList();
        } else if (options.length > 0) {
          setActiveIndex((index) => (index + 1) % options.length);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open && options.length > 0) {
          setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1));
        }
        break;
      case "Enter":
        // Never submits the surrounding filter form.
        event.preventDefault();
        if (open && activeIndex >= 0 && options[activeIndex]) {
          choose(options[activeIndex]);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
        } else if (text) {
          event.preventDefault();
          setText("");
        }
        break;
      case "Tab":
        close();
        break;
    }
  }

  let status = "";
  if (open) {
    if (state.kind === "loading") {
      status = "Meklē dzimtas…";
    } else if (state.kind === "error") {
      status = "Dzimtu sarakstu neizdevās ielādēt. Mēģiniet vēlreiz.";
    } else if (state.kind === "ready") {
      if (options.length === 0) {
        status = text.trim() ? "Neviena dzimta neatbilst meklētajam." : "Nav dzimtu, ko pievienot.";
      } else if (state.hasMore) {
        status = `Rādītas pirmās ${FAMILY_OPTIONS_LIMIT} dzimtas — precizējiet meklēšanu.`;
      } else {
        status = foundMessage(options.length);
      }
    }
  }

  const expanded = open && options.length > 0;
  const activeId = expanded && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined;

  return (
    <div className="directoryCombobox">
      <label className="directoryFilterSelectLabel" htmlFor={inputId}>
        Meklēt un pievienot dzimtu
      </label>
      <div className="directoryComboboxField">
        <input
          id={inputId}
          className="directoryFilterSelect"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          aria-describedby={`${hintId} ${statusId}`}
          value={text}
          disabled={disabled}
          maxLength={100}
          placeholder={disabled ? disabledReason : "Nosaukums vai tā daļa"}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
            load(event.target.value);
          }}
          onFocus={openList}
          onClick={openList}
          onBlur={close}
          onKeyDown={handleKeyDown}
        />
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Dzimtas"
          className="directoryComboboxList"
          hidden={!expanded}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className="directoryComboboxOption"
              // mousedown, not click: keeps focus in the input (no blur first).
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
            >
              {option.value} <span className="directoryComboboxCount">({option.count})</span>
            </li>
          ))}
        </ul>
      </div>
      <p id={hintId} className="directoryFiltersHint">
        Meklē arī alternatīvajos rakstības variantos. Rāda tikai pārbaudītas saistības.
      </p>
      <p id={statusId} className="directoryFiltersHint" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
