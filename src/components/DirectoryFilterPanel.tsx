"use client";

import { usePathname } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";
import DirectoryFamilyPicker from "@/components/DirectoryFamilyPicker";
import { useDirectoryListing } from "@/components/DirectoryListingProvider";
import {
  CONDITION_VALUES,
  EMPTY_FILTERS,
  FAMILY_UNKNOWN_FLAG,
  FILTER_PARAM_KEYS,
  MAX_FAMILIES,
  MAX_REGIONS,
  OBJECT_TYPE_VALUES,
  OWNERSHIP_VALUES,
  PUBLIC_ACCESS_VALUES,
  SERVICE_VALUES,
  countActiveFilters,
} from "@/lib/directory/filters";
import {
  FAMILY_UNKNOWN_CHIP_LABEL,
  FAMILY_UNKNOWN_OPTION_LABEL,
  conditionChipLabel,
  conditionFilterLabel,
  familyChipLabel,
  objectTypeLabel,
  ownershipGroupChipLabel,
  ownershipGroupLabel,
  publicAccessLabel,
  serviceLabel,
} from "@/lib/directory/labels";
import type { RegionOption } from "@/lib/directory/regionOptions";

const DESKTOP_FILTER_QUERY = "(min-width: 64rem)";
function subscribeDesktop(callback: () => void) {
  if (!window.matchMedia) return () => {};
  const media = window.matchMedia(DESKTOP_FILTER_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function desktopSnapshot() {
  return window.matchMedia?.(DESKTOP_FILTER_QUERY).matches ?? false;
}

type ListKey = "types" | "access" | "services" | "conditions" | "ownership";

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
 * Like the search field, it changes the URL only through the shared listing
 * controller (DirectoryListingProvider); the server renders the listing that
 * URL describes, so refresh, sharing and Back/Forward work.
 *
 * - Every change is derived from the latest intended filters and keeps the
 *   latest intended search - even one still in flight - and drops the
 *   cursor: a filter change always starts on page 1.
 * - While a navigation is in flight the checkboxes show the visitor's
 *   latest choice rather than snapping back to the URL; they follow the URL
 *   again once it settles (including Back/Forward).
 * - Within one group, choices are combined with OR; groups are combined
 *   with AND. Services are independent: each ticked service must be
 *   recorded as offered.
 * - Condition, ownership and family (Day 18) each offer "not recorded" as
 *   one more choice of the group; a known value never matches a missing one.
 * - Without JavaScript it is a plain GET form with a submit button.
 */
export default function DirectoryFilterPanel({
  regionOptions,
}: {
  /** Null when the options could not be loaded. */
  regionOptions: RegionOption[] | null;
}) {
  const pathname = usePathname();
  const { listing, updateFilters, setListing, pendingSource } = useDirectoryListing();
  const draft = listing.filters;
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  // Closed by default, even with active filters: the chips below the
  // summary already show what is applied, and on a phone an open panel
  // would push every result below the first screen.
  const [open, setOpen] = useState(false);
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, () => false);
  const regionSelectId = useId();
  const statusId = useId();

  // Each change is computed from the latest intended filters at the moment
  // it is applied (not from this render's copy), so quick successive
  // changes build on each other; undoing a change still in flight
  // navigates back instead of being lost.
  function toggleValue(key: ListKey, value: string) {
    updateFilters((current) => ({
      ...current,
      [key]: toggle(current[key] as string[], value),
    }));
  }

  function addRegion(value: string) {
    if (value) {
      updateFilters((current) =>
        current.regions.includes(value)
          ? current
          : { ...current, regions: [...current.regions, value] },
      );
    }
  }

  function removeRegion(value: string) {
    updateFilters((current) => ({
      ...current,
      regions: current.regions.filter((region) => region !== value),
    }));
  }

  function addFamily(value: string) {
    if (value) {
      updateFilters((current) =>
        current.families.includes(value)
          ? current
          : { ...current, families: [...current.families, value] },
      );
    }
  }

  function removeFamily(value: string) {
    updateFilters((current) => ({
      ...current,
      families: current.families.filter((family) => family !== value),
    }));
  }

  function toggleFamilyUnknown() {
    updateFilters((current) => ({ ...current, familyUnknown: !current.familyUnknown }));
  }

  const activeCount = countActiveFilters(draft);
  const regionChoices = (regionOptions ?? []).filter(
    (option) => !draft.regions.includes(option.value),
  );
  const regionLimitReached = draft.regions.length >= MAX_REGIONS;
  const familyLimitReached = draft.families.length >= MAX_FAMILIES;

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
    ...draft.conditions.map((value) => ({
      key: `condition-${value}`,
      label: conditionChipLabel(value),
      remove: () => toggleValue("conditions", value),
    })),
    ...draft.ownership.map((value) => ({
      key: `ownership-${value}`,
      label: ownershipGroupChipLabel(value),
      remove: () => toggleValue("ownership", value),
    })),
    ...draft.families.map((value) => ({
      key: `family-${value}`,
      label: familyChipLabel(value),
      remove: () => removeFamily(value),
    })),
    ...(draft.familyUnknown
      ? [{ key: "family-unknown", label: FAMILY_UNKNOWN_CHIP_LABEL, remove: toggleFamilyUnknown }]
      : []),
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
        {listing.q ? <input type="hidden" name="q" value={listing.q} /> : null}
        <details
          open={desktop || open}
          onToggle={(event) => {
            if (!desktop) setOpen(event.currentTarget.open);
          }}
        >
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

            <fieldset className="directoryFilterGroup">
              <legend>Stāvoklis</legend>
              <p className="directoryFiltersHint">
                A un B klase ir platformas iekšēja klasifikācija, nevis oficiāls Latvijas
                apzīmējums.
              </p>
              {CONDITION_VALUES.map((value) => (
                <label key={value} className="directoryFilterOption">
                  <input
                    type="checkbox"
                    name={FILTER_PARAM_KEYS.conditions}
                    value={value}
                    checked={draft.conditions.includes(value)}
                    onChange={() => toggleValue("conditions", value)}
                  />
                  {conditionFilterLabel(value)}
                </label>
              ))}
            </fieldset>

            <fieldset className="directoryFilterGroup">
              <legend>Pašreizējais īpašnieks</legend>
              <p className="directoryFiltersHint">
                Īpašnieka veids — nevis tas, vai objektu var apmeklēt.
              </p>
              {OWNERSHIP_VALUES.map((value) => (
                <label key={value} className="directoryFilterOption">
                  <input
                    type="checkbox"
                    name={FILTER_PARAM_KEYS.ownership}
                    value={value}
                    checked={draft.ownership.includes(value)}
                    onChange={() => toggleValue("ownership", value)}
                  />
                  {ownershipGroupLabel(value)}
                </label>
              ))}
            </fieldset>

            <fieldset className="directoryFilterGroup">
              <legend>Vēsturiskā īpašnieku dzimta</legend>
              {hydrated ? (
                <DirectoryFamilyPicker
                  selected={draft.families}
                  onSelect={addFamily}
                  disabled={familyLimitReached}
                  disabledReason={`Var izvēlēties līdz ${MAX_FAMILIES} dzimtām`}
                />
              ) : (
                <p className="directoryFiltersHint">Dzimtu meklēšanai nepieciešams JavaScript.</p>
              )}
              {/* Keeps already chosen families in a no-JavaScript submit. */}
              {!hydrated
                ? draft.families.map((value) => (
                    <input
                      key={value}
                      type="hidden"
                      name={FILTER_PARAM_KEYS.families}
                      value={value}
                    />
                  ))
                : null}
              <label className="directoryFilterOption">
                <input
                  type="checkbox"
                  name={FILTER_PARAM_KEYS.familyUnknown}
                  value={FAMILY_UNKNOWN_FLAG}
                  checked={draft.familyUnknown}
                  onChange={toggleFamilyUnknown}
                />
                {FAMILY_UNKNOWN_OPTION_LABEL}
              </label>
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

      {chips.length > 0 || listing.q ? (
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
                onClick={() => updateFilters(() => EMPTY_FILTERS)}
              >
                {listing.q ? "Notīrīt filtrus (paturēt meklēšanu)" : "Notīrīt filtrus"}
              </button>
            ) : null}
            <button
              type="button"
              className="directoryTextButton"
              onClick={() => setListing({ q: null, filters: EMPTY_FILTERS }, "filters")}
            >
              Notīrīt meklēšanu un filtrus
            </button>
          </div>
        </div>
      ) : null}

      <p id={statusId} className="directorySearchStatus" role="status" aria-live="polite">
        {pendingSource === "filters" ? "Atlasa…" : ""}
      </p>
    </div>
  );
}
