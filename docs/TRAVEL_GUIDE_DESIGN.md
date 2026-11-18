# MuizasDB travel guide and map explorer

## Baseline and integration

Requested design: contemporary travel guide for discovery; Nordic explorer layout for the detailed map, with one olive/ochre visual identity.

Branch: `codex/travel-guide-design`, based on the latest map branch `claude/day19-map` at `443dd7795f98bf8779f73d8d931b3a35f8c2bd9c`. GitHub `main` is still at `f3311e7` and does not yet include Days 17–19. Review this change against the map branch, then integrate the prerequisite map/filter work before the design reaches `main`.

No database migration, package change or new environment variable is introduced by the redesign. Existing Day 17–19 migrations and map-provider settings remain prerequisites for the underlying map and filters.

## Implemented experience

- **Homepage:** a locally hosted Rundāle Palace photograph with visible attribution, prominent GET search into `/objects`, working catalogue shortcuts and clear map entry points. The old development roadmap is replaced with visitor-facing content.
- **Real objects:** the homepage reads the first three published directory records at request time. They are labelled as discovery suggestions, not recommendations or popularity rankings. Missing configuration, a query failure or an empty catalogue produces a link to the catalogue, never invented manor records.
- **Shortcuts:** object type and public-access shortcuts use existing validated URL filters. The current database has municipality filters, not a historical-region taxonomy; no Vidzeme/Kurzeme classification is guessed from municipality strings.
- **Catalogue:** shared search and list/map switch above a persistent desktop filter sidebar. Below 1024px the sidebar becomes a disclosure panel. Existing shared listing state, debounce, URL validation, pagination, no-JavaScript forms and filter semantics are retained.
- **Map:** above 1280px, filters, viewport-result list and map form three columns. At narrower widths the result list follows the map. Results are compact text entries because the existing viewport API returns no cover-image metadata; the redesign does not add per-object image requests. Each result retains a detail-page link and adds a labelled “Rādīt kartē” button that selects, recentres and opens the object popup. Map marker selection also highlights the result. A ResizeObserver invalidates Leaflet's canvas when its container changes size.
- **Detail pages:** matching sans-serif typography, olive headings, wider hero photograph and clearer fact rows.
- **Shared identity:** white surfaces, olive `#59633c`, ochre `#c99a38`, dark text on ochre buttons for contrast, consistent icons, header and footer. No downloaded fonts or new UI dependencies.
- **Accessibility:** labelled forms, visible keyboard focus, skip link, live statuses, selected-result button state, mobile navigation, neutral placeholders for unrecorded images and reduced-motion support.

The photographic source and derivative license are documented in [ATTRIBUTION.md](../public/images/ATTRIBUTION.md).

## Verification

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test`: 506 passing tests across 50 files, including real-record homepage rendering, unavailable-data fallback, supported discovery links and map-result selection.
- `npm run build`: production build passes without production credentials.
- Local production HTTP checks with an external test-only Supabase stand-in: homepage, catalogue, filtered catalogue, map and object detail return 200; unknown object returns 404; map endpoint returns the expected three fixture points. Fixtures run outside the application repository and are never a production fallback.

Browser screenshots could not be captured in this execution environment: local Chromium cannot create its required Unix socket, and the separate browser cannot reach the local server. Responsive CSS and interactive map rendering therefore still need a real desktop/mobile browser review. No screenshot is presented as implementation evidence. No live Supabase or production tile-provider integration was verified.

The pull request must remain a draft until that visual review is complete; local checks alone do not replace the repository's required GitHub CI result.
