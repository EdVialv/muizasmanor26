"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useSyncExternalStore, useTransition } from "react";
import {
  EMPTY_FILTERS,
  MAX_REGIONS,
  OBJECT_TYPE_VALUES,
  PUBLIC_ACCESS_VALUES,
  SERVICE_VALUES,
  buildListingHref,
  canonicalFilters,
  countActiveFilters,
  filtersEqual,
  parseListing,
  type DirectoryFilters,
} from "@/lib/directory/filters";
import { objectTypeLabel, publicAccessLabel, serviceLabel } from "@/lib/directory/labels";
import type { RegionOption } from "@/lib/directory/regionOptions";

type ListKey = "types" | "access" | "services";

/** For useSyncExternalStore: "hydrated" never changes once true. */
function subscribeToNothing() {
  return () => {};
}

function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/**
 * The directory's filter panel and active-filter list (Day 17 -
 * docs/DAY17_DIRECTORY_FILTERS_NOTES.md).
 *
 * Like the search field, it only edits the URL; the server renders the
 * listing that URL describes, so refresh, sharing and Back/Forward work.
 *
 * - Every change navigates to the new listing with its search kept and its
 *   cursor dropped: a filter change always starts on page 1.
 * - Navigations run in a React transition. The App Router renders only the
 *   newest one, and while one is in flight the checkboxes show the
 *   visitor's latest choice rather than snapping back to the URL; they
 *   follow the URL again once it settles (including Back/Forward).
 * - Within one group, choices are combined with OR; groups are combined
 *   with AND. Services are independent: each ticked service must be
 *   recorded as offered.
 * - Without JavaScript it is a plain GET form with a submit button.
 */
export default function DirectoryFilterPanel({
  regionOptions,
}: {
  /** Null when the options could not be loaded. */
  regionOptions: RegionOption[] | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = parseListing(searchParams);

  const [draft, setDraft] = useState<DirectoryFilters>(url.filters);
  const [syncedUrlKey, setSyncedUrlKey] = useState(() => JSON.stringify(url.filters));
  const [isPending, startTransition] = useTransition();
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  // Closed by default, even with active filters: the chips below the
  // summary already show what is applied, and on a phone an open panel
  // would push every result below the first screen.
  const [open, setOpen] = useState(false);
  const regionSelectId = useId();
  const statusId = useId();

  // Follow the URL whenever no navigation of ours is in flight (adjusting
  // state during render, as React recommends over an effect). While one is
  // in flight, `draft` keeps the visitor's latest choice.
  const urlFiltersKey = JSON.stringify(url.filters);
  if (!isPending && syncedUrlKey !== urlFiltersKey) {
    setSyncedUrlKey(urlFiltersKey);
    setDraft(url.filters);
  }

  function navigate(q: string | null, filters: DirectoryFilters) {
    startTransition(() => {
      router.push(buildListingHref(pathname, { q, filters }), { scroll: false });
    });
  }

  function apply(next: DirectoryFilters) {
    const canonical = canonicalFilters(next);
    // Compared with `draft`, the latest intended state - not the URL, which
    // may still be catching up - so undoing a change that is in flight
    // navigates back instead of being lost.
    if (!filtersEqual(canonical, draft)) {
      setDraft(canonical);
      navigate(url.q, canonical);
    }
  }

  function toggleValue(key: ListKey, value: string) {
    apply({ ...draft, [key]: toggle(draft[key] as string[], value) });
  }

  function addRegion(value: string) {
    if (value && !draft.regions.includes(value)) {
      apply({ ...draft, regions: [...draft.regions, value] });
    }
  }

  function removeRegion(value: string) {
    apply({ ...draft, regions: draft.regions.filter((region) => region !== value) });
  }

  const activeCount = countActiveFilters(draft);
  const regionChoices = (regionOptions ?? []).filter(
    (option) => !draft.regions.includes(option.value),
  );
  const regionLimitReached = draft.regions.length >= MAX_REGIONS;

  const chips: Array<{ key: string; label: string; remove: () => void }> = [
    ...draft.types.map((value) => ({
      key: `type-${value}`,
      label: objectTypeLabel(value),
      remove: () => toggleValue("types", value),
    })),
    ...draft.regions.map((value) => ({
      key: `region-${value}`,
      label: value,
      remove: () => removeRegion(value),
    })),
    ...draft.access.map((value) => ({
      key: `access-${value}`,
      label: publicAccessLabel(value),
      remove: () => toggleValue("access", value),
    })),
    ...draft.services.map((value) => ({
      key: `service-${value}`,
      label: serviceLabel(value),
      remove: () => toggleValue("services", value),
    })),
  ];

  return (
    <div className="directoryFilterArea">
      <form
        className="directoryFilters"
        action={pathname}
        method="get"
        aria-describedby={statusId}
        onSubmit={(event) => event.preventDefault()}
      >
        {url.q ? <input type="hidden" name="q" value={url.q} /> : null}
        <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className="directoryFiltersSummary">
            Filtri{activeCount > 0 ? ` (${activeCount})` : ""}
          </summary>

          <div className="directoryFiltersBody">
            <p className="directoryFiltersHint">
              Vienā grupā atzīmētie varianti apvienojas ar „vai”, dažādas grupas — ar „un”.
            </p>

            <fieldset className="directoryFilterGroup">
              <legend>Objekta veids</legend>
              {OBJECT_TYPE_VALUES.map((value) => (
                <label key={value} className="directoryFilterOption">
                  <input
                    type="checkbox"
                    name="type"
                    value={value}
                    checked={draft.types.includes(value)}
                    onChange={() => toggleValue("types", value)}
                  />
                  {objectTypeLabel(value)}
                </label>
              ))}
            </fieldset>

            <fieldset className="directoryFilterGroup">
              <legend>Novads</legend>
              {regionOptions === null ? (
                <p className="directoryFiltersHint">Novadu saraksts šobrīd nav pieejams.</p>
              ) : (
                <>
                  <label className="directoryFilterSelectLabel" htmlFor={regionSelectId}>
                    Pievienot novadu
                  </label>
                  <select
                    id={regionSelectId}
                    className="directoryFilterSelect"
                    name="region"
                    value=""
                    disabled={regionLimitReached || regionChoices.length === 0}
                    onChange={(event) => addRegion(event.target.value)}
                  >
                    <option value="">
                      {regionLimitReached
                        ? `Var izvēlēties līdz ${MAX_REGIONS} novadiem`
                        : "Izvēlieties novadu…"}
                    </option>
                    {regionChoices.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value} ({option.count})
                      </option>
                    ))}
                  </select>
                </>
              )}
              {/* Keeps already chosen regions in a no-JavaScript submit. */}
              {!hydrated
                ? draft.regions.map((value) => (
                    <input key={value} type="hidden" name="region" value={value} />
                  ))
                : null}
            </fieldset>

            <fieldset className="directoryFilterGroup">
              <legend>Apmeklējuma iespējas</legend>
              <p className="directoryFiltersHint">
                Vai objektu var apmeklēt — tas nav saistīts ar to, kam objekts pieder.
              </p>
              {PUBLIC_ACCESS_VALUES.map((value) => (
                <label key={value} className="directoryFilterOption">
                  <input
                    type="checkbox"
                    name="access"
                    value={value}
                    checked={draft.access.includes(value)}
                    onChange={() => toggleValue("access", value)}
                  />
                  {publicAccessLabel(value)}
                </label>
              ))}
            </fieldset>

            <fieldset className="directoryFilterGroup">
              <legend>Pakalpojumi</legend>
              <p className="directoryFiltersHint">
                Rāda tikai objektus, kuriem pakalpojums ir reģistrēts. Ja atzīmēti vairāki, jābūt
                visiem.
              </p>
              {SERVICE_VALUES.map((value) => (
                <label key={value} className="directoryFilterOption">
                  <input
                    type="checkbox"
                    name="service"
                    value={value}
                    checked={draft.services.includes(value)}
                    onChange={() => toggleValue("services", value)}
                  />
                  {serviceLabel(value)}
                </label>
              ))}
            </fieldset>

            {!hydrated ? (
              // Only before hydration: with JavaScript every change applies at once.
              <button type="submit" className="directoryPaginationLink">
                Rādīt rezultātus
              </button>
            ) : null}
          </div>
        </details>
      </form>

      {chips.length > 0 || url.q ? (
        <div className="directoryActiveFilters">
          {chips.length > 0 ? (
            <>
              <h2 className="visuallyHidden">Aktīvie filtri</h2>
              <ul className="directoryChips">
                {chips.map((chip) => (
                  <li key={chip.key}>
                    <button
                      type="button"
                      className="directoryChip"
                      onClick={chip.remove}
                      aria-label={`Noņemt filtru: ${chip.label}`}
                    >
                      {chip.label}
                      <span aria-hidden="true"> ×</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="directoryClearActions">
            {chips.length > 0 ? (
              <button
                type="button"
                className="directoryTextButton"
                onClick={() => apply(EMPTY_FILTERS)}
              >
                {url.q ? "Notīrīt filtrus (paturēt meklēšanu)" : "Notīrīt filtrus"}
              </button>
            ) : null}
            <button
              type="button"
              className="directoryTextButton"
              onClick={() => {
                setDraft(EMPTY_FILTERS);
                navigate(null, EMPTY_FILTERS);
              }}
            >
              Notīrīt meklēšanu un filtrus
            </button>
          </div>
        </div>
      ) : null}

      <p id={statusId} className="directorySearchStatus" role="status" aria-live="polite">
        {isPending ? "Atlasa…" : ""}
      </p>
    </div>
  );
}
