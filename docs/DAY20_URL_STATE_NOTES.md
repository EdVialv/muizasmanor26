# Day 20 — shareable URL state

Day 20 makes the URL the complete, shareable description of what a visitor is browsing. The URL covers the view, the search, the filters, the list page and the map position. Opening a link, refreshing, Back/Forward and "Kopēt saiti" all restore the same state.

Scope: URL state and navigation only. Day 20 adds no new filters, no admin work and no migration.

## Baseline

- `main` is `f3311e7`. Days 17–19 are not merged.
- Day 20 is built on the owner-pushed `claude/day17-directory-filters` (`e46b81c`) and `claude/day18-condition-ownership-family` (`9b13fdb`).
- Day 20 is built on the owner-pushed `claude/day19-map`, ending in the reviewed Day 19 fix `443dd77` ("harden map configuration and request races"). The first Day 20 delivery was based on `9de61a3`, which has the same tree as `9b43948` but lacked that fix; the correction rebased the Day 20 commits onto `443dd77` (no conflicts). See "Corrections after review".
- Branch: `claude/day20-url-state`.

## The URL model

One module, `src/lib/directory/browseState.ts`, parses and serialises the state for both views. It is used by the server pages, by the client provider and by every link between them. The map position lives in `src/lib/map/position.ts`.

**The path is the view:** `/objects` is the list and `/map` is the map.

### Parameters

Parameters always appear in the order listed.

| Parameter        | Meaning                   | Default (omitted) | Valid values                                                                                                      | Used by                                          |
| ---------------- | ------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `q`              | search query              | no search         | Exactly one value, normalised (Day 16), up to 200 characters. A repeated `q` is ignored.                          | list, map                                        |
| `type`           | object types              | all               | Known enum values in enum order, deduplicated.                                                                    | list, map                                        |
| `region`         | regions (municipality)    | all               | Up to 10 values of up to 120 characters, NFC-normalised, trimmed, sorted by code point.                           | list, map                                        |
| `access`         | public access             | all               | Known enum values.                                                                                                | list, map                                        |
| `service`        | recorded services         | all               | `accommodation`, `catering`, `events`.                                                                            | list, map                                        |
| `condition`      | condition                 | all               | Enum values, then `unknown`.                                                                                      | list, map                                        |
| `ownership`      | ownership group           | all               | `private`, `public`, `unknown`.                                                                                   | list, map                                        |
| `family`         | historical owner families | all               | Up to 10 canonical names (Day 18).                                                                                | list, map                                        |
| `family_unknown` | "not recorded" family     | off               | Only `1`.                                                                                                         | list, map                                        |
| `cursor`         | list page (keyset)        | page 1            | One base64url token of at most 2,048 characters that decodes and whose scope is this exact search and filter set. | list; the map carries it but does not use it     |
| `lat`, `lng`     | map centre                | all of Latvia     | Decimals rounded to 5 places. The centre must be inside the Latvia box widened by 1°.                             | map; the list carries them but does not use them |
| `zoom`           | map zoom                  | fitted to Latvia  | An integer from 6 to 19.                                                                                          | map; the list carries it                         |

The listing parameters (`q` to `family_unknown`) are unchanged from Days 16–18. Every existing link keeps working.

### Rules

- **One URL per state.** Defaults are omitted, and values are validated, deduplicated and ordered, so a state has exactly one URL.
  - `parseBrowseState(buildBrowseHref(state))` returns the same state.
  - Serialising the parsed state of any URL is idempotent.
- **Invalid values are dropped and the rest is kept.**
  - An unknown filter value, a tampered cursor, or a cursor from another search or filter set is dropped. The list shows its first page with the existing notice.
  - A partial, repeated, malformed (`1e2`, hex, a fractional zoom) or out-of-range position is dropped. The map then opens on all of Latvia.
  - Each part is judged on its own. For example, a bad position does not drop a valid cursor.
- **No results or history in the URL.** The URL never encodes results or accumulated navigation history.
- **The URL stays bounded.** Every parameter has a fixed maximum size, so the URL does not grow however long someone browses. A test checks this across 200 page turns, map moves and view switches.
- **Map bounds never restrict the list.** The list ignores `lat`, `lng` and `zoom`. The map's count ("Šajā kartes skatā: N objekti") is the viewport count, and the list stays the whole matching directory.
- **Centre and zoom are authoritative, not bounds.** A link shows the same place at the same scale on every screen. Each screen derives its own viewport, and so its own data request, from the centre and zoom. A narrow phone simply shows less around the same centre. Bounds are never written to the URL.
  - When the configured tile layer allows a lower maximum zoom than the link's zoom, Leaflet clamps the zoom. The URL is then corrected in place to the zoom actually shown.

### Example relative URLs

| What                                         | URL                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Plain directory                              | `/objects`                                                                                         |
| Search and two filters                       | `/objects?q=mui%C5%BE&type=manor_estate&type=manor_house`                                          |
| Unknown values in filters                    | `/objects?condition=class_a&condition=unknown&ownership=unknown&family_unknown=1`                  |
| Page 2 of that list                          | `/objects?q=mui%C5%BE&type=manor_estate&type=manor_house&cursor=<token>`                           |
| The map of the same selection, all of Latvia | `/map?q=mui%C5%BE&type=manor_estate&type=manor_house`                                              |
| The map at a position (Riga, zoom 12)        | `/map?q=pils&lat=56.9496&lng=24.1052&zoom=12`                                                      |
| Everything at once (list view)               | `/objects?q=pils&type=palace_or_castle&cursor=<token>&lat=56.9496&lng=24.1052&zoom=12`             |
| Object opened from the map                   | `/objects/<slug>?fromQ=pils&from=<token>&fromView=map&fromLat=56.9496&fromLng=24.1052&fromZoom=12` |

This messy link:

`/objects?zoom=9&lng=24.1000&lat=56.950&type=manor_house&type=manor_house&type=spaceship&q=%20pils%20&cursor=bogus`

is shown as follows:

- The server renders page 1 of `q=pils&type=manor_house`, with the "invalid filters" and "invalid page link" notices.
- The browser then rewrites the address in place (no new history entry) to `/objects?q=pils&type=manor_house&lat=56.95&lng=24.1&zoom=9`.

## Synchronisation

`DirectoryListingProvider` owns the whole browse state: listing, cursor and position.

- **Every change starts from the newest state.** Controls read the latest intended state and change it, never their own snapshot of the URL. This is the Day 17 design, extended to the cursor and the position.
- **Search and filter changes go back to page 1.**
  - They use the latest complete state: search and filters together, keeping the position.
  - They reset the cursor and navigate with the App Router.
  - The Day 17 race guarantees still hold: an older navigation landing last never overrides a newer one.
- **Pagination is the server-rendered "Nākamā lapa" link.**
  - It carries the selection and the position.
  - The provider adopts the new URL as an external change.
- **Switching views keeps everything.**
  - "Saraksts" and "Karte" carry the whole intended state, including any change still in flight.
  - Going to the map and back returns to the same list page. Going the other way returns to the same map view.
- **Map moves are written after they settle.**
  - After a `moveend`, the map waits 400 ms (`MAP_URL_DEBOUNCE_MS`), then reports its centre and zoom. The data request has its own 300 ms debounce.
  - The provider writes the position with `history.replaceState`. That is a shallow update: no server request, and the App Router keeps `useSearchParams()` in step.
  - While a search or filter navigation is in flight, nothing is written. The newest position is added once that navigation lands.
- **No feedback loop from programmatic moves.** The map applies positions programmatically in two cases: the first view, and a restore after Back/Forward. It only reports a position that differs from both the intended position and the fitted default view. A restore therefore never writes back, and the default view is never written to the URL.
- **Positions written late are corrected.** The provider remembers every state it intended. If the URL settles on one of those but not on the newest state, it is corrected once. That happens when an older navigation lands last, or a position arrives after a newer move. The correction uses `router.replace` when the listing or cursor differs, and `replaceState` when only the position differs.
  - The same step canonicalises non-canonical URLs.
  - Each correction is attempted at most once per (URL, target) pair, and its target is a fixed point. A navigation that cannot change the URL therefore cannot loop.
- **Back/Forward wins over everything pending.**
  - A `popstate` listener records the restored URL and the URL shown when the event fired. The state follows the URL once it is the restored one, or has changed since the event, even while one of our navigations is still in flight. The App Router discards that navigation.
  - The provider's epoch moves on. Search commits and map moves started in the old epoch are ignored, and the search field cancels its debounce timer.
  - The map moves to the restored position, or to the default view.
- **Stale responses are ignored.** The list relies on the Day 17 transition handling; the map relies on the Day 19 request sequence plus aborting.

### History behaviour (deliberate)

| Action                                                                         | History                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filter toggle, chip removal, "Notīrīt filtrus", "Notīrīt meklēšanu un filtrus" | push (one entry)                                                                                                                                                                                                                                                                                                                   |
| Typing a search                                                                | The first commit of a typing burst pushes. Later commits replace that entry once it has landed; until it has, they push and the App Router discards the superseded navigation, so the entry before the search is never overwritten. Leaving the field (blur) commits a search still waiting for its debounce, then ends the burst. |
| Enter / "Notīrīt" in the search field                                          | part of the current burst                                                                                                                                                                                                                                                                                                          |
| "Nākamā lapa", "Saraksts" / "Karte", object links, back links                  | push (ordinary links)                                                                                                                                                                                                                                                                                                              |
| Map pan / zoom                                                                 | replace, debounced: never adds entries                                                                                                                                                                                                                                                                                             |
| Canonicalisation, corrections of stale landings                                | replace                                                                                                                                                                                                                                                                                                                            |

So Back steps through what the visitor chose: filters, searches, pages and views. It does not step through every pause in typing or every map drag. The map position at the time someone leaves a page is saved in that page's entry, so Back to the map returns to where they were.

### Cursor invalidation

A cursor is valid only for the listing it was issued for. Its scope is an FNV-1a hash of the search and canonical filters.

- **Search or filter change:** the cursor is reset by the provider. The server would reject it anyway.
- **Shared or edited link with a cursor from another listing:** the server shows page 1 with a notice, and the client removes the cursor from the address.
- **Map moves and view switches** keep the cursor: the map does not affect the list.
- **Cursor tokens are validated on both sides.** Since Day 20 the client checks them too, for canonicalisation. Decoding uses `atob` and `TextDecoder` everywhere. A first version used `Buffer` where available, and a client bundle's `Buffer` polyfill rejected tokens containing `-` or `_`. The browser journey caught this: the cursor was removed right after "Nākamā lapa". A regression test now covers it.

### Without JavaScript

- The search and filter forms are still GET forms to the same path. They carry the other half of the listing and the position as hidden inputs, and never a cursor.
- "Nākamā lapa", the view switch's server-rendered hrefs and object links carry the full state.
- The map needs JavaScript. Its `<noscript>` link opens the same state as a list.
- "Kopēt saiti" is not rendered without JavaScript, because the address bar already holds the canonical link.

## "Kopēt saiti"

`src/components/DirectoryCopyLink.tsx`, next to the view switch.

- **What it copies:** the absolute canonical URL of the newest intended state, including a change still in flight, using `navigator.clipboard.writeText`.
- **Success:** "Saite nokopēta." appears in a polite `role="status"` region. It clears as soon as the state changes, so it never claims an older link.
- **Failure:** when the clipboard is unavailable or refuses (no permission, an insecure context, an old browser), the status says so. A read-only field labelled "Saite uz šo skatu" appears, focused and selected, so the link can be copied by hand.
- **Style:** it uses the existing pill-button style and Latvian copy, and wraps under the switch on narrow screens.

## Files

- **New:** `src/lib/directory/browseState.ts`, `src/lib/map/position.ts`, `src/components/DirectoryCopyLink.tsx`, and tests `browseState.test.ts`, `position.test.ts`, `src/components/DirectoryUrlState.test.tsx`.
- **Changed:**
  - `DirectoryListingProvider.tsx`: the whole browse state, popstate, epoch, history modes and corrections.
  - `DirectorySearchField.tsx`: epoch, burst and hidden position inputs.
  - `DirectoryFilterPanel.tsx`: hidden position inputs.
  - `DirectoryViewSwitch.tsx`, `DirectoryFrame.tsx` (toolbar), `map/DirectoryMap.tsx`, `map/LeafletMap.tsx` (restore and report).
  - `lib/directory/links.ts`: `fromLat`, `fromLng`, `fromZoom`; the map carries `from`.
  - `lib/directory/cursor.ts`: portable decoding.
  - The list, map and object pages, and `globals.css`.

## Verification

- **Gate:** format, lint, typecheck, tests (52 files, 549 tests), build, typecheck after build and `npm audit --omit=dev` (0 vulnerabilities) all pass.
- **Unit and integration tests** cover:
  - parsing and serialising every parameter, including unknown filter values;
  - canonical order, defaults, duplicates and invalid, repeated or oversized input;
  - cursor scope and invalidation;
  - URL boundedness;
  - browser cursor decoding;
  - restoring a shared link, with the map created at the URL position;
  - canonicalising once, with no loop;
  - map moves replacing the URL and never navigating, and a late position never overriding a newer one;
  - a move during a filter navigation;
  - filter changes resetting the cursor and keeping the position;
  - the typing burst's history;
  - page links being followed;
  - Back/Forward over an in-flight navigation, and dropping the pending debounced search and map move;
  - "Kopēt saiti" success, failure and no clipboard.
- **Browser (Chromium, production build, local PostgreSQL + PostgREST, stand-in tiles):** 66/66 Day 20 checks.
  - The full journey, on desktop 1280×900 and mobile 390×844:
    1. search plus two filters;
    2. next page;
    3. the map, with pan and zoom;
    4. copy the link and open it in a fresh tab — same controls, same viewport count, first data request at the shared zoom, the same list page;
    5. refresh, Back ×2, Forward ×2;
    6. open an object, follow "Atpakaļ uz karti", and use browser Back.
  - Races: a slow search, a filter and a zoom at once; Back while a search is still debouncing.
  - Canonicalisation of a messy link.
  - No-JavaScript forms keeping the position.
- **Regressions:** Day 19 (22/22), Day 17 (27/27, 19/19) and Day 18 (27/27, 6/6) browser suites pass.
- **Screenshots:** `docs/day20-screenshots/`.
- **Not verified:** Supabase itself, real tile providers, and browsers other than Chromium (Firefox and Safari clipboard permission behaviour in particular). In those browsers the fallback field is the expected path when permission is refused.

## Corrections after review

1. **Day 19 fixes restored.** The branch now includes `443dd77` itself: `useMapData` aborts and invalidates an older request as soon as the intended request URL changes (before the debounce expires); `tileConfig` rejects unsupported placeholders (only `{z}`, `{x}`, `{y}`, `{s}`, `{r}`) and malformed braces; `LeafletMap` keeps `minZoom <= maxZoom` for providers with a low maximum zoom. Its regression tests are included. The Day 20 commits were rebased onto it rather than cherry-picking it onto the old base: the owner's Day 19 commits have the same tree as the old base, so the code is identical either way, and the branch no longer carries a duplicate copy of Day 19.
2. **Search history after blur.** Leaving the field used to end the typing burst while a debounced search was still pending; that search then fired, started a new burst, and the next separate search replaced its history entry. Blur now commits the pending search in the current epoch (through `commit()`, which cancels the timer) and then ends the burst. Back/Forward safeguards are unchanged: after Back/Forward the timer is already cancelled, so blur commits nothing.
3. **Back/Forward while a landing is unsynced** (found by the new regression test). After popstate, the provider adopted any URL that differed from the last _synced_ URL. If one of our navigations had landed but was not yet synced (another transition still pending), that landing was adopted instead of the restored URL. The provider now compares with the URL shown when popstate fired.

## Limitations and decisions for review

1. **Centre and zoom, not bounds.** Two different screens opening one link see the same centre and scale, not the same edges. This is deliberate; see "Rules".
2. **The list carries the map position passively, and the map carries the cursor.** URLs are a little longer, but switching views never loses state. It stays bounded.
3. **Typing bursts end on blur.** A visitor who refines a search without leaving the field keeps one history entry for the whole refinement. Leaving the field commits a pending search at once rather than 300 ms later.
4. **Late `replaceState` arrival.** If a canonicalisation write arrives after the visitor has already changed something else in the same frame, the provider treats it as an external URL. It is a fixed point, so nothing loops, but the newer change could be lost. This is not reproducible at human speed.
5. **No-JavaScript form URLs are not canonicalised** (for example an empty `region=`). Without JavaScript there is nothing to rewrite them, and the server parses them correctly.
