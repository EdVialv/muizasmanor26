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

| Filter (URL param)                             | Schema                                                                                                                 | Known values                                                                                                                                                                       | "Unknown / not recorded"                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Condition (`condition`)                        | `heritage_objects.condition_category`, nullable enum (Day 8)                                                           | The four stored values, unchanged: `historical_site`, `damaged`, `class_b`, `class_a`, with the documented labels Vēsturiska vieta, Bojāta ēka, B klase, A klase                   | `condition=unknown` matches `condition_category IS NULL`                           |
| Ownership (`ownership`)                        | `heritage_objects.ownership_type`, nullable enum (Day 8)                                                               | The two groups defined in `DATA_MODEL.md` "Ownership filter groups" and `MVP_SCOPE.md`: `private` = `private_person` + `private_legal_entity`; `public` = `municipality` + `state` | `ownership=unknown` matches `ownership_type IS NULL`                               |
| Historical family (`family`, `family_unknown`) | `object_historical_owner_families` (one row per object–family link), only rows with `verification_status = 'verified'` | `family=<canonical family name>`; an object matches if any of its verified links has that canonical name                                                                           | `family_unknown=1` matches objects with **no verified** link with a non-empty name |

Notes on the mapping:

- **Ownership vs public access.** Ownership stays separate from the Day 17 public-access filter, and the UI says so next to the group.
- **Verified family links only.** Day 14 object pages show only verified families. Filtering on unverified links would return objects whose pages do not show that family.
- **Family identity.** The schema has no family registry (Day 8 decision 3), so the family name is the only identifier. Every query uses its **canonical form** (see "Canonical family names" below), so stored names that differ only by surrounding whitespace or Unicode composition are one family. Genuinely different spellings still appear as separate options, as municipalities do.
- **Picker search.** The picker searches `alternate_spellings` too, but always applies the canonical family name.

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

- **`canonical_family_name(text)` (new, decision 8).** It applies Unicode NFC, then removes leading and trailing whitespace: exactly the set of characters JavaScript's `String.prototype.trim()` removes. It returns `NULL` when nothing is left, and it is immutable so it can be indexed.
- **`private.search_published_object_keys` (recreated).** This ids-only `SECURITY DEFINER` helper takes three more pairs of arguments: condition values + unknown, ownership values + unknown, family names + unknown.
  - Each group's condition is written so that, with `force_custom_plan`, the unused branches fold away.
  - Selected families become an id array computed once with `array_agg(distinct …)`, comparing `canonical_family_name(family_name)`. That array is a set, so there are no duplicates.
  - "Unknown family" is a `NOT EXISTS` over verified links with a non-empty canonical name.
- **`search_public_heritage_objects` (recreated).** Still `SECURITY INVOKER`. It also takes `condition_categories`, `ownership_groups`, `historical_families` and `family_unknown`.
  - Unknown values are dropped, and the ownership groups are expanded to stored values.
  - A group given only unusable values matches nothing.
  - At most 50 values per array. Family names are canonicalised with `canonical_family_name()` and must be at most 120 characters.
- **`public_directory_historical_families(search, row_limit)`.** This feeds the family picker. It returns **canonical** family names of published objects' verified links, one row per canonical name, whose name or alternate spelling contains the search text (case- and diacritic-insensitive via `fold_search_text`). Each row carries the number of distinct published objects, and the result has at most 50 rows. Names longer than 120 characters, which the URL parser would refuse, are not offered.
  - **Trust boundary.** This function is **`SECURITY DEFINER`**: it runs as its owner, so **Row Level Security does not filter what it reads**. The boundary is the function's own SQL:
    - it reads only links with `verification_status = 'verified'` whose object has `status = 'published'`;
    - it returns only canonical names and object counts, never ids, years, sources or unverified names;
    - its search text is a bound argument, folded and escaped before `LIKE`;
    - it runs with `search_path = ''`.

    The result is a subset of what `anon` may already read from `object_historical_owner_families` under the Day 9 RLS policy, which exposes every link of a published object, unverified ones included. It was made `SECURITY DEFINER` for performance (see "Performance"). Any change to its body must keep these limits, because RLS will not catch a mistake.
- **One index:** `object_historical_owner_families_verified_name_idx` on `(canonical_family_name(family_name), object_id) WHERE verification_status = 'verified'`.

### Canonical family names (second review)

`family_name` is free text, and the schema allows values such as `"  Ābele "` or a decomposed `"A\u0304bele"`. The filters no longer rely on stored data being clean, and they rewrite nothing. There is one canonical form, and every layer uses it:

| Layer                 | Canonicalisation                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database              | `canonical_family_name()` (NFC + JavaScript-trim whitespace set)                                                                                                                  |
| Options RPC           | groups links by canonical name, canonicalising each distinct stored spelling once (a materialised CTE), so variants give **one option with one merged count of distinct objects** |
| Browser value and URL | `normalizeFamily()` in `filters.ts` (`normalize("NFC").trim()`), the same transformation                                                                                          |
| Matching RPC          | canonicalises its input with `canonical_family_name()` and compares it with `canonical_family_name(family_name)` through the expression index                                     |

A family stored as `"  Ābele "` is therefore offered as `Ābele`, put in the URL as `family=Ābele`, and matches that object. `"Ābele"`, `"  Ābele "` and NFD `"Ābele\t"` are one option whose count is the number of distinct objects. A verified link whose name is empty after canonicalisation is not a family: it is never offered or matched, and it does not stop an object counting as "not recorded".

### Application

- **`src/lib/directory/filters.ts`.** New URL parameters, validation and canonical order:
  - condition values in `DATA_MODEL.md` order, then `unknown`;
  - ownership `private`, `public`, `unknown`;
  - families normalised like regions (at most 10, at most 120 characters, code-point sorted);
  - `family_unknown` accepts only `1`.
- **`src/lib/directory/supabaseSearchDataSource.ts`.** The new values travel as bound RPC arguments; an empty group is sent as `null`.
- **`src/lib/directory/familyOptions.ts` and `src/app/api/directory/families/route.ts`.** `GET /api/directory/families?q=…` returns at most 20 matches (21 are fetched to detect "more"), sorted in Latvian order for display.
  - It reads through the anon-key client, never a service key. The function it calls is `SECURITY DEFINER` (trust boundary above).
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

| Case                                     | Sparse  | Dense   | Dense, without the canonical-name index |
| ---------------------------------------- | ------- | ------- | --------------------------------------- |
| condition `class_a`                      | 0.44 ms | 0.26 ms | —                                       |
| condition unknown                        | 0.28 ms | 0.24 ms | —                                       |
| condition `damaged` + unknown            | 0.27 ms | 0.28 ms | —                                       |
| ownership private                        | 0.49 ms | 0.21 ms | —                                       |
| ownership unknown                        | 0.27 ms | 0.23 ms | —                                       |
| one family                               | 0.60 ms | 1.35 ms | 15.86 ms                                |
| rare family (3 / 36 objects)             | 0.43 ms | 0.64 ms | 12.75 ms                                |
| two families (OR)                        | 0.79 ms | 1.83 ms | 18.38 ms                                |
| family unknown                           | 0.38 ms | 1.69 ms | 14.46 ms                                |
| family + unknown                         | 0.93 ms | 2.68 ms | 20.69 ms                                |
| search + family                          | 0.70 ms | 1.47 ms | 10.76 ms                                |
| condition + ownership + family + unknown | 1.17 ms | 2.91 ms | 20.84 ms                                |
| no match (unknown family name)           | 0.43 ms | 0.44 ms | 9.83 ms                                 |
| family options, first 21                 | 1.46 ms | 7.06 ms | 6.98 ms                                 |
| family options, search "kenin"           | 1.56 ms | 7.17 ms | 7.08 ms                                 |

These figures are from the second review's final migration, freshly applied. Earlier figures in this file's history were taken before family names were canonicalised.

- **Condition and ownership** use the existing Day 9 B-tree indexes, or walk the Day 16 partial `(name_lv, id)` index. Both stay under 0.5 ms, so no index was added for them.
- **The canonical-name expression index is required.** Without it, every family filter computed `canonical_family_name()` for every verified link: 10–21 ms per page at 3,888 links, against 0.4–2.9 ms with it. It is partial (verified links only) and replaces the earlier plain `family_name` index.
- **No index for "not recorded".** A second partial index on `(object_id)` for verified, non-empty names was measured at 0.95 ms against 1.37 ms without it on the dense data. That gain was too small to justify another index, so it is not included.
- **Options query shape.** Canonicalising inside a plain grouping evaluated the function per link and per sort row, taking 22–38 ms dense. Canonicalising each distinct stored spelling once, in a materialised CTE, brings it back to ~7 ms.
- **An earlier `SECURITY INVOKER` version of the family options function** made the RLS policy's `EXISTS` run as a hashed scan of all 10,643 published objects on every call, at 3.1 ms and 5.5 ms (sparse). As `SECURITY DEFINER`, which folds each distinct name once, the same calls take 1.4 ms and 1.5 ms.
- **Family options at dense scale** take ~7 ms, because every call groups all verified links. The route's 60 s `Cache-Control` absorbs repeats. A maintained family list would be the next step if needed; it is not built here.

## Decisions requiring Codex review

1. **Ownership filters by the two documented groups**, not the four stored values.
2. **Only verified family links count**, for matching, for "unknown" and for options, which is consistent with Day 14 object pages.
3. **A family is identified by its canonical name** (`canonical_family_name()`: NFC + JavaScript-trim whitespace), the same in SQL, the options, the URL and matching. Genuinely different spellings remain separate options, and the picker searches alternate spellings.
4. **"Unknown" is an explicit, OR-ed choice.** Known values never match missing ones. For families, unknown means "no verified link".
5. **`public_directory_historical_families` is `SECURITY DEFINER`, so RLS does not apply to it.** Its own SQL is the boundary: published objects and verified links only, canonical names and counts only, `search_path = ''` (see "Trust boundary"). It was chosen for the measured performance reason above.
6. **The family picker loads at most 20 options per request** through a new route handler (`/api/directory/families`); the list is never loaded whole.
7. **`family_unknown=1` is a separate parameter.** Family names are free text, so a sentinel value inside `family` could collide with a real name.
8. **One partial index** on verified family links, with a modest measured benefit.
9. **Labels need copy review:**
   - "Nezināms / nav reģistrēts" and "Nezināma / nav reģistrēta";
   - "Privāts (privātpersona vai privāts juridiskais subjekts)" and "Publisks (pašvaldība vai valsts)";
   - "Stāvoklis", "Pašreizējais īpašnieks", "Vēsturiskā īpašnieku dzimta" and the chip wording.

## Corrections after Codex review (second round)

Codex reviewed the Day 18 branch, which had been built on the _uncorrected_ Day 17, and asked for four fixes.

1. **Cross-control URL race.**
   - Day 18 is now rebased onto the corrected Day 17, so the three new filter groups and the family picker change the listing only through the shared `DirectoryListingProvider`.
   - The provider no longer depends on navigations completing in order. An older target settling last is corrected back to the newest listing with `router.replace()`; see the Day 17 notes.
2. **No-JavaScript search form.** It carries `condition`, `ownership`, `family` and `family_unknown` as well as the Day 17 parameters. They come from `filtersToEntries()`, so they are canonical, repeated where needed, and have no invalid values and no cursor.
3. **One canonical family name**, end to end; see "Canonical family names".
4. **Trust boundary documented accurately.** `public_directory_historical_families` is `SECURITY DEFINER`. The code comments (`familyOptions.ts`, the route handler) and this file now say that RLS does not filter it, and that its own SQL is the boundary.

Also: `next` and `eslint-config-next` went from 16.4.3 to 16.4.6, in a separate commit on the Day 17 branch. Advisories published since `f3311e7` made `next build` and `npm audit --omit=dev` fail on 16.4.3, on `main` too.

### Regression tests added in this round

- **`src/components/DirectoryListingProvider.test.tsx`** (integration: search field, filter panel and family picker under one provider; navigations complete when and in the order the test chooses):
  - a search, then a condition at once, with the newer navigation landing first and the older last; the stale landing is corrected;
  - an ownership change, then a committed search;
  - a family picked in the picker while a search is in flight, then "family not recorded" and a new search, landing out of order;
  - a debounced search firing after a Day 18 filter;
  - the server-rendered, unhydrated search form carrying all eight filter parameters (repeated, canonical, invalid values and cursor absent), and the URL a native GET submission produces.
- **`src/lib/directory/filters.test.ts`:**
  - `normalizeFamily()` against the same table of cases as the SQL test (padding, tab/newline, decomposed, NBSP, ideographic space, BOM, em space, paragraph separator, inner spaces kept, blanks);
  - several spellings of one name giving one URL value.
- **`supabase/tests/directory_family_names.test.sql`** (new; transaction rolled back; run only on a disposable local database):
  - the `canonical_family_name()` table;
  - padded, decomposed+tab, clean and duplicate-on-one-object names giving **one option with a merged distinct-object count**, also when found by an alternate spelling;
  - no option ever non-canonical;
  - matching from any spelling of the name, an object with two equivalent links returned once, and a blank selection matching nothing;
  - unverified-only, draft and blank-named links handled correctly for "not recorded".

  On the previous migration the same assertions fail ("3 rows, count 1").

- **Quality gate.** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and typecheck after the build passed. `npm audit --omit=dev` found 0 vulnerabilities.
  - 42 test files, 462 tests (432 at first delivery; the rest come from the Day 17 corrections and this round). `git diff --check` is clean from `f3311e7`.
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
- **SQL regression test** `supabase/tests/directory_family_names.test.sql` — passed on a fresh local database with all seven migrations.
- **SQL against a local database** (886 published realistic objects, Day 17 + Day 18 fixtures and one draft; re-run after the second round):
  - 23 cases were walked page by page as `anon` and equalled the ground truth, in order and without duplicates. Examples: condition `class_a` 88; unknown 528; ownership private 169; public + unknown 717; family Ābele 27; Ābele OR Šteins 51; family unknown 652; three-way AND 12.
  - Unverified-only and draft-only family names return 0, and a draft matching every filter is never returned.
  - Options exclude draft and unverified names, alternate spellings and diacritics match (`kenin`, `König`), and `%` is literal.
- **Browser, second round** (production build with Next 16.4.6):
  - **6 of 6** new checks passed:
    - a delayed search, then "family not recorded";
    - a delayed condition, then a search;
    - a family picked during a delayed search — each kept both, and results equalled the database;
    - padded and decomposed stored names gave one option (`Testa dzimta Ābele (29)`) and their objects were found;
    - a no-JavaScript search kept all eight filter parameters and dropped the cursor;
    - Back/Forward restored search + ownership.
  - The 19 Day 17 race and no-JavaScript checks and the 27 checks below were re-run: **19/19 and 27/27** passed.
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
- Genuinely different family spellings (not just whitespace or Unicode composition) remain separate options until a family registry exists.
- `supabase/tests/` is plain SQL run with `psql`; there is no automated database test runner or CI job for it yet.
- Family options group every verified link per call: ~7 ms at 3,888 links locally, with a 60 s cache.
- Family options are ordered by the database collation before the first 20 are taken, then re-sorted in Latvian order for display. With more than 20 matches, which names make the cut depends on that collation.
- The family picker needs JavaScript; without it, chosen families are kept but new ones cannot be added.
- "No historical family" cannot be expressed in the schema.
- All verification data is local and synthetic and was never committed.
