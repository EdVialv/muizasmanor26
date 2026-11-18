# Day 18 — condition, ownership and historical-family filters

The Day 18 deliverable from `TODO.md`: "Add condition, ownership and historical-family filters with verified labels and null handling" (issue [#9](https://github.com/EdVialv/muizasmanor26/issues/9)).

**Baseline.** Built on the Day 17 branch `claude/day17-directory-filters` at `1c09a36`. When this session started, Day 17 had **not** been reviewed or merged: `main` on GitHub was still `f3311e7`, with no Day 17 pull request. `1c09a36` is therefore the only Day 17 implementation. If Codex changes Day 17 in review, this branch needs a rebase.

No maps, admin editing, booking, payments or redesign are included.

## Deployment requirement

**Apply `supabase/migrations/20261115090000_directory_classification_filters.sql` after the Day 15, 16 and 17 migrations, and deploy it together with this code.**

Nothing has been applied anywhere. Like Day 17, this migration **replaces** the search function's signature, so:

- Day 17 code fails once the migration is applied;
- Day 18 code fails until it is applied, and searched or filtered listings show their error state.

The plain directory and object pages are unaffected. The migration adds no column and changes no data.

## Filter-to-schema mapping

| Filter (URL param)                             | Schema                                                                                                                 | Known values                                                                                                                                                                       | "Unknown / not recorded"                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Condition (`condition`)                        | `heritage_objects.condition_category`, nullable enum (Day 8)                                                           | The four stored values, unchanged: `historical_site`, `damaged`, `class_b`, `class_a`, with the documented labels Vēsturiska vieta, Bojāta ēka, B klase, A klase                   | `condition=unknown` matches `condition_category IS NULL`     |
| Ownership (`ownership`)                        | `heritage_objects.ownership_type`, nullable enum (Day 8)                                                               | The two groups defined in `DATA_MODEL.md` "Ownership filter groups" and `MVP_SCOPE.md`: `private` = `private_person` + `private_legal_entity`; `public` = `municipality` + `state` | `ownership=unknown` matches `ownership_type IS NULL`         |
| Historical family (`family`, `family_unknown`) | `object_historical_owner_families` (one row per object–family link), only rows with `verification_status = 'verified'` | `family=<exact family_name>`; an object matches if any of its verified links has a selected name                                                                                   | `family_unknown=1` matches objects with **no verified** link |

Notes on the mapping:

- **Ownership vs public access.** Ownership stays separate from the Day 17 public-access filter, and the UI says so next to the group.
- **Verified family links only.** Day 14 object pages show only verified families. Filtering on unverified links would return objects whose pages do not show that family.
- **Family identity.** The schema has no family registry (Day 8 decision 3), so `family_name` is the only stable identifier. Spellings that differ between objects appear as separate options, as municipalities do.
- **Picker search.** The picker searches `alternate_spellings` too, but always applies the stored `family_name`.

### Discrepancies with the documentation

1. **Null handling.** `DATA_MODEL.md` says "Exclude null condition and ownership values from those filters until verified". Choosing a known value never returns a missing one, which is consistent with that rule. The explicit "Nezināms / nav reģistrēts" choice is the Day 18 brief's addition. It shows missing values only when the visitor asks for them, and it never presents them as a category.
2. **"No family" cannot be recorded.** The schema has no way to say an object had no historical family. A missing link is therefore always "not recorded", and there is no "none" option.
3. **Unverified links read as "not recorded".** An object whose only family links are unverified counts as "not recorded" for this filter, because the public page shows no family for it either.

## Unknown-value semantics

- **No selection in a group:** every object, known or not.
- **Known values only:** objects with one of those values. Missing values are excluded.
- **"Unknown" only:** objects where the schema has no value: `NULL` condition, `NULL` ownership, or no verified family link.
- **Known values + "unknown":** either group (OR).
- **Labels:** missing information is labelled "Nezināms / nav reģistrēts" (for family, "Nezināma / nav reģistrēta"). Chips read "Stāvoklis nav reģistrēts", "Īpašnieks nav reģistrēts" and "Dzimta nav reģistrēta". Missing information is never called "private", "ruined" or "no historical family".
- **Source data:** never rewritten to make filtering simpler.

## Combination rules

- **OR within a group, AND between groups.** This applies across every Day 17 and Day 18 filter and the Day 16 search, all in **one** server-side query.
- **One result per object.** Family matching computes the set of matching object ids once per call, inside the matching function. An object linked to several selected families appears once. There is no query per result.
- **Same order and pagination.** Results keep the `(name_lv, id)` keyset order and `page_size + 1` page detection. Cursors are scoped to the full search-and-filter state, because the new parameters are part of the canonical query string that `listingScope` fingerprints. Any change resets to page 1, and "Nākamā lapa" keeps every selection.
- **Day 17 links unchanged.** A listing that uses only Day 17 filters keeps exactly the same URL and cursor scope as before.

## How it is built

### Database (`20261115090000_directory_classification_filters.sql`)

- **`private.search_published_object_keys` (recreated).** This ids-only `SECURITY DEFINER` helper takes three more pairs of arguments: condition values + unknown, ownership values + unknown, family names + unknown.
  - Each group's condition is written so that, with `force_custom_plan`, the unused branches fold away.
  - Selected families become an id array computed once with `array_agg(distinct …)`. That array is a set, so there are no duplicates.
  - "Unknown family" is a `NOT EXISTS` over verified links.
- **`search_public_heritage_objects` (recreated).** Still `SECURITY INVOKER`. It also takes `condition_categories`, `ownership_groups`, `historical_families` and `family_unknown`.
  - Unknown values are dropped, and the ownership groups are expanded to stored values.
  - A group given only unusable values matches nothing.
  - At most 50 values per array, and family names of at most 120 characters.
- **`public_directory_historical_families(search, row_limit)`.** This feeds the family picker. It returns verified family names of published objects whose name or alternate spelling contains the search text (case- and diacritic-insensitive via `fold_search_text`), with object counts, at most 50 rows.
  - It is `SECURITY DEFINER` (see "Performance") but hard-codes published objects and verified links, and returns only names and counts. That is less than `anon` may already read from the table under RLS.
- **One index:** `object_historical_owner_families_verified_name_idx` on `(family_name, object_id) WHERE verification_status = 'verified'`.

### Application

- **`src/lib/directory/filters.ts`.** New URL parameters, validation and canonical order:
  - condition values in `DATA_MODEL.md` order, then `unknown`;
  - ownership `private`, `public`, `unknown`;
  - families normalised like regions (at most 10, at most 120 characters, code-point sorted);
  - `family_unknown` accepts only `1`.
- **`src/lib/directory/supabaseSearchDataSource.ts`.** The new values travel as bound RPC arguments; an empty group is sent as `null`.
- **`src/lib/directory/familyOptions.ts` and `src/app/api/directory/families/route.ts`.** `GET /api/directory/families?q=…` returns at most 20 matches (21 are fetched to detect "more"), sorted in Latvian order for display.
  - It reads through the anon-key client.
  - Responses are cacheable for 60 s.
  - Errors return 503 or 502 with a generic body.
- **`src/components/DirectoryFamilyPicker.tsx`.** The WAI-ARIA combobox-with-listbox pattern:
  - typing is debounced (250 ms), and only the newest request is shown (older ones are aborted and late answers ignored);
  - ArrowUp/Down, Enter and Escape work, and mouse selection keeps focus in the field;
  - loading, no-match, capped and failed states are announced in a polite live region;
  - already chosen families are hidden from the list, with at most 10 families.
- **`src/components/DirectoryFilterPanel.tsx`.** Three new labelled fieldsets in the existing panel:
  - "Stāvoklis", with the note that A/B is an internal platform classification;
  - "Pašreizējais īpašnieks", with the note that ownership is not access;
  - "Vēsturiskā īpašnieku dzimta", containing the picker and the not-recorded checkbox.

  New chips with individual removal are included in "Filtri (n)", and both clear actions cover the new filters. Without JavaScript, chosen families are kept as hidden inputs; the picker needs JavaScript, and the panel says so.

- **`src/app/objects/(directory)/page.tsx`.** The no-results text now mentions the "Nezināms / nav reģistrēts" choice.
- **`src/lib/directory/labels.ts`.** New labels (see "Decisions").
- **`src/app/globals.css`.** Combobox styles from existing tokens, including a high-contrast active option.

## Performance

These are local measurements only. The final migration was applied fresh to PostgreSQL 16, followed by `VACUUM ANALYZE`, and called as `anon`; each figure is the median of 21 calls for one 25-row page. **Nothing was measured on Supabase.**

There were two data shapes on **10,643 published objects** (the 886 realistic objects scaled up):

- **Sparse:** fixtures only on the original objects. 358 objects have a known condition, 358 a known ownership, and there are 324 verified family links on 235 objects. This is the realistic early state.
- **Dense:** every scaled copy inherits its original's values, giving 4,307 known conditions and ownerships and 3,888 verified links on 2,820 objects.

| Case                                     | Sparse  | Dense   | Dense, without the family index |
| ---------------------------------------- | ------- | ------- | ------------------------------- |
| condition `class_a`                      | 0.45 ms | 0.31 ms | —                               |
| condition unknown                        | 0.27 ms | 0.30 ms | —                               |
| condition `damaged` + unknown            | 0.30 ms | 0.29 ms | —                               |
| ownership private                        | 0.45 ms | 0.24 ms | —                               |
| ownership unknown                        | 0.27 ms | 0.28 ms | —                               |
| one family                               | 0.57 ms | 1.88 ms | 2.17 ms                         |
| rare family (3 / 36 objects)             | 0.42 ms | 0.57 ms | 1.06 ms                         |
| two families (OR)                        | 0.71 ms | 2.08 ms | 2.39 ms                         |
| family unknown                           | 0.38 ms | 0.95 ms | 1.71 ms                         |
| family + unknown                         | 0.66 ms | 2.63 ms | 2.91 ms                         |
| search + family                          | 0.62 ms | 1.91 ms | 2.21 ms                         |
| condition + ownership + family + unknown | 0.88 ms | 2.81 ms | 3.01 ms                         |
| no match (unknown family name)           | 0.40 ms | 0.42 ms | 0.80 ms                         |
| family options, first 21                 | 1.43 ms | 7.04 ms | —                               |
| family options, search "kenin"           | 1.53 ms | 6.92 ms | —                               |

- **Condition and ownership** use the existing Day 9 B-tree indexes, or walk the Day 16 partial `(name_lv, id)` index. Both stay under 0.5 ms, so no index was added for them.
- **The family index** speeds up family filters by 10–50% at 3,888 links; with a sparse family set it makes no measurable difference. It is small and partial (verified links only). It was kept because the cost of finding a family's objects without it grows with every recorded link. Codex may judge it marginal.
- **Family options as `SECURITY INVOKER`** made the RLS policy's `EXISTS` run as a hashed scan of all 10,643 published objects on every call, at 3.1 ms and 5.5 ms (sparse). As `SECURITY DEFINER`, which folds each distinct name once, the same calls take 1.4 ms and 1.5 ms.
- **Family options at dense scale** take ~7 ms, because every call groups all verified links. The route's 60 s `Cache-Control` absorbs repeats. A maintained family list would be the next step if needed; it is not built here.

## Decisions requiring Codex review

1. **Ownership filters by the two documented groups**, not the four stored values.
2. **Only verified family links count**, for matching, for "unknown" and for options, which is consistent with Day 14 object pages.
3. **A family is identified by its exact stored `family_name`.** Variants are separate options, and the picker searches alternate spellings.
4. **"Unknown" is an explicit, OR-ed choice.** Known values never match missing ones. For families, unknown means "no verified link".
5. **`public_directory_historical_families` is `SECURITY DEFINER`**, for the measured reason above, with hard-coded published and verified limits and only names and counts returned.
6. **The family picker loads at most 20 options per request** through a new route handler (`/api/directory/families`); the list is never loaded whole.
7. **`family_unknown=1` is a separate parameter.** Family names are free text, so a sentinel value inside `family` could collide with a real name.
8. **One partial index** on verified family links, with a modest measured benefit.
9. **Labels need copy review:**
   - "Nezināms / nav reģistrēts" and "Nezināma / nav reģistrēta";
   - "Privāts (privātpersona vai privāts juridiskais subjekts)" and "Publisks (pašvaldība vai valsts)";
   - "Stāvoklis", "Pašreizējais īpašnieks", "Vēsturiskā īpašnieku dzimta" and the chip wording.

## Verification

- **Quality gate.** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and typecheck after the build passed. `npm audit --omit=dev` found 0 vulnerabilities.
  - Test counts are in `PROGRESS.md`.
  - The gate ran on Node 22.23.4 (the repo asks for ≥ 24; npm only warns).
- **Unit and component tests:**
  - each new filter on its own;
  - several values within a group;
  - the new filters with search and with Day 17 filters;
  - known, unknown and mixed selections;
  - objects with several families, returned once;
  - a full walk of 40 objects across pages;
  - next-link selections and a scoped cursor;
  - cursor refusal after a change;
  - URL round-trips, invalid and obsolete values, bounds and `NFC` duplicates;
  - chips, clearing (keeping the search) and the picker's keyboard, mouse, stale-answer, empty, capped and failure states;
  - the route handler's bounds and generic errors.
- **SQL against a local database** (886 published realistic objects, Day 17 + Day 18 fixtures and one draft):
  - 23 cases were walked page by page as `anon` and equalled the ground truth, in order and without duplicates. Examples: condition `class_a` 88; unknown 528; ownership private 169; public + unknown 717; family Ābele 27; Ābele OR Šteins 51; family unknown 652; three-way AND 12.
  - Unverified-only and draft-only family names return 0, and a draft matching every filter is never returned.
  - Options exclude draft and unverified names, alternate spellings and diacritics match (`kenin`, `König`), and `%` is literal.
- **Browser** (Playwright, production build → local PostgREST → local database): **27 of 27 checks passed.**
  - Every filter in the UI equalled the database across all pages, including search + type + condition + ownership + family + unknown together.
  - The picker found a family by its alternate spelling and worked from the keyboard, with a visible 3 px focus outline.
  - Page 2 kept the selections, refresh showed the same cards, and a change dropped the cursor.
  - Chips used the "not recorded" wording; removing one chip and "clear filters" (search kept) worked; Back/Forward restored selections.
  - A delayed older result never replaced the newer one, and invalid values showed the notice.
  - Drafts and unverified links never matched or appeared as options, and the options endpoint was bounded.
  - The object page's back link returned to the same filtered page.
  - There was no horizontal overflow at 1280 px or 360 px with the family list open.
- **Screenshots** (`docs/day18-screenshots/`, local fixture data with synthetic "Testa dzimta …" names):
  - `filters-desktop-results.jpg` and `filters-desktop-panel.jpg`;
  - `filters-mobile-results.jpg`, `filters-mobile-condition-ownership.jpg`, `filters-mobile-family-picker.jpg` and `filters-mobile-no-results.jpg`.
- **Blocked:**
  - nothing ran against the real Supabase project (no credentials, and migrations must not be applied);
  - no Supabase timings;
  - no real condition, ownership or family data exists to test with.

## Known limitations

- On real data the three filters' known values return nothing until editors record condition, ownership and verified families. Only "Nezināms / nav reģistrēts" returns objects.
- Family spelling variants are separate options until a family registry or normalisation exists.
- Family options group every verified link per call: ~7 ms at 3,888 links locally, with a 60 s cache.
- Family options are ordered by the database collation before the first 20 are taken, then re-sorted in Latvian order for display. With more than 20 matches, which names make the cut depends on that collation.
- The family picker needs JavaScript; without it, chosen families are kept but new ones cannot be added.
- "No historical family" cannot be expressed in the schema.
- All verification data is local and synthetic and was never committed.
