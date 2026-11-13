# Day 15 — images, sources and first visual alpha

This is the Day 15 deliverable from `TODO.md`: "Add lazy responsive images, credits, sources, verification dates, contacts and accessibility text" (issue [#7](https://github.com/EdVialv/muizasmanor26/issues/7)).

- **Branch:** `claude/day15-visual-alpha`
- **Base:** the Day 14 commit `018ca0c` on `claude/day14-object-pages`.
- **One new migration, not applied anywhere:** `supabase/migrations/20261113090000_object_images_access.sql`.
- **No new dependency.**

## Deployment requirement

**Apply the migration before deploying this code.** The directory and the object page now select the new `heritage_objects` columns and embed `object_images`; against a database without the migration every request fails and both pages show their error state. The migration is additive — one new table, five new nullable columns — so it is safe to apply while the Day 13/14 code is still running. Nothing in it loads data, and nothing here applied it to any Supabase project.

## What this delivers

- `supabase/migrations/20261113090000_object_images_access.sql` — the `object_images` table and visitor-access/accessibility columns.
- `src/components/ObjectImage.tsx` — one photograph in a fixed-ratio box, with staged fallback.
- `src/lib/images/bloggerImage.ts` — responsive URLs for Blogger-hosted images.
- `src/components/object/` — `ObjectGallery` (hero and gallery), `ObjectAccessSection`, `ObjectContactsSection`, `ObjectSourcesSection`.
- `src/lib/format/dates.ts`, `safeLinks.ts` — Latvian dates for recorded dates only; link targets that refuse unsafe schemes.
- `src/lib/objects/detail.ts`, `supabaseDetailDataSource.ts` — the object query now embeds images and public contacts in the same request.
- `src/lib/directory/queries.ts`, `supabaseDataSource.ts`, `HeritageObjectCard.tsx` — each card's cover image and recorded public-access value, embedded in the same request as the card.
- `src/app/globals.css` — image, gallery and access styles; one new token, `--accent-text`.
- `docs/day15-screenshots/` — six review screenshots.

## Images

**Where they come from.** The owner directed that the pictures are reached through column G of the workbook, "Attēla oriģinālā saite blogā". All 16,800 values in that column are `https://blogger.googleusercontent.com/img/b/…/s<size>/<file>` URLs. `object_images.source_image_url` holds that URL and the site displays it directly.

**Responsive.** The `s<size>` path segment is Blogger's size directive (fit within that many pixels on the longer side). `ObjectImage` uses `next/image` with a loader that rewrites that one segment, which gives a real `srcset` with a `sizes` attribute per slot — card, hero, thumbnail — without Next's optimizer and without copying any file. It never requests more than the original's own size.

**Stable.** Every image sits in a `.objectImageFrame` box with a fixed 3:2 aspect ratio and `object-fit: cover`. The box sets the layout size, so a card looks the same with a cover, without one, while loading and after a failure. Measured cumulative layout shift on the directory: 0.

**Loading.** Everything is `loading="lazy"` except the hero at the top of an object page, which is eager with high fetch priority.

**Missing or failed.** An object with no image gets the neutral box on its card and nothing at all on its page. A request that fails falls back in two steps: first to the stored URL untouched, then to a fallback in the same box. Since the follow-up below, that fallback links to the picture itself.

**Alt text.** The recorded `alt_text_lv`; else the recorded caption; else, on an object page, the object's name and the image's position ("Rundāles pils, 2. attēls"). The fallback never describes what a picture shows. A card's cover has an empty alt when none is recorded, because the card's heading already names the object.

**Credits.** `source_attribution_note` is `NOT NULL`, so an image cannot exist without the attribution to print. The hero shows its caption, credit, attribution and licence (linked when a licence URL is recorded); the gallery prints each distinct credit once below the grid. Gallery thumbnails link to the full-size original in a new tab.

**Follow-up (owner request): links to the original pictures.** The owner asked that, where a picture cannot be shown, its own column G hyperlink is embedded instead. A second commit on this Day 15 branch adds:

- **The fallback links to the picture.** "Attēlu neizdevās parādīt. **Atvērt attēlu avotā**" links to the image's column G URL in a new tab. This applies wherever a picture fails: hero and directory cards. Its accessible name includes the picture's alt text when there is one.
- **Gallery thumbnails get no extra link.** They are already links to the original, so their fallback is plain text inside that link, never a link nested in a link.
- **The hero always links to its original.** "Atvērt oriģinālo attēlu" under the hero links to the column G URL, whether or not the picture loads.

**Checked in a browser** with every request to the image host aborted, which is the real situation from this sandbox. All 9 checks passed:

- the hero and all 3 gallery fallbacks of Tīmaņu muiža link to their own URLs, identical to the database's column G values in display order;
- all 24 directory cards on page 1 link to their covers;
- no link is nested in another;
- the hero link takes a visible 3 px focus outline;
- no horizontal overflow at 360 px or 1280 px.

Screenshots: `docs/day15-screenshots/fallback-links-*.jpg`.

**What this does not change.** Visitors' browsers still load the pictures from those same URLs. Only this build sandbox cannot reach the image host.

## Sources, contacts and access

- **Source and verification** — `source_url` as a link (host name as the link text) and `last_verified_at` as a Latvian date. `ownership_verified_at` appears beside the ownership category, a contact's `verified_at` beside the contact. Dates are printed only when recorded and parseable; nothing substitutes a deployment date or today.
- **Contacts** — only rows the Day 9 RLS policy returns (`visibility = 'public'` on a published object). A value is linked only when it is plainly an e-mail address, a phone number or an http(s) URL of the matching contact type; anything else, including `javascript:` and `data:` URLs, is printed as text.
- **Visitor access and accessibility** — always shown, unlike the page's other optional facts, because here an absent answer can mislead. Nothing recorded: "Informācija … vēl nav apkopota". One of the two recorded: the other is printed as "Nav zināms". "Nav pieejams" appears only for a stored `not_accessible`. Cards show an access tag only for a recorded value.

## Consistency and accessibility

- The directory heading now uses the same title scale as an object page, not the landing page's display size.
- The card grid uses `auto-fill` instead of `auto-fit`, so a page with one or two cards keeps them at card width.
- `--accent` on `--paper` is 4.41:1, under WCAG AA for small text. A new `--accent-text` (#985726; 5.13:1 on `--paper`, 5.54:1 on `--surface`) is used wherever the accent colours text. `--accent` itself is unchanged for borders and focus rings.
- Every link on both pages is reachable by Tab in document order with a visible 3 px focus outline; one `h1` per page, heading levels never skip (asserted in tests).

## Decisions requiring Codex review

1. **The site hotlinks the blog's images.** `docs/DAY6_NORMALIZATION_RULES.md` §6 says to keep the original URL for provenance and not to use it as the product asset. This follows the owner's later instruction instead. Consequences: availability depends on Blogger, and each visitor's browser makes requests to a Google host. Moving the files into project storage later needs only a new nullable column.
2. **The Blogger resize behaviour is implemented from the URL format, not observed.** This session's sandbox proxy refuses connections to `blogger.googleusercontent.com`, so no real image was ever loaded. If a resized URL fails, `ObjectImage` falls back to the untouched original, so the worst case is full-size downloads, not broken images. **Needs a check in a real browser.**
3. **Column-level grants on `object_images`.** anon/authenticated can read only the display columns; `drive_reference_url`, `drive_filename`, `external_image_id` and `source_row_number` are not granted, and `select=*` is refused.
4. **`attribution_required_pending_review` images are public.** That is the initial rights status. The owner confirmed reuse with source attribution; only `not_cleared` is hidden.
5. **Access vocabulary.** `public_access`: `open`, `by_appointment`, `exterior_only`, `not_accessible`. `accessibility`: `accessible`, `partially_accessible`, `not_accessible`. Both nullable, NULL meaning not recorded. The Latvian labels are this session's wording.
6. **Images and contacts are embedded in the object query**, so the hero is in the first response and there is no follow-up request. The embeds are bounded: 25 images (24 shown), 20 contacts.
7. **No image import.** Populating `object_images` from the workbook is staging/promotion work and was not done.

## Verification

Run on Node 22.23.4 (the repo requires Node ≥ 24; npm warns only).

- `npm run format:check`, `npm run lint`, `npm run typecheck` — passed.
- `npm test` — passed: 31 files, **266 tests** (200 → 266, of which 3 come from the picture-link follow-up).
- `npm run build` — passed.
- `npm audit --omit=dev` — 0 vulnerabilities.

**Migration, against a disposable local PostgreSQL 16 + PostGIS database** with the three earlier migrations applied first: it applies cleanly. Through PostgREST 12.2.3 as the anon role:

| Check                                               | Result                            |
| --------------------------------------------------- | --------------------------------- |
| `select=*` on `object_images`                       | refused (42501)                   |
| select `drive_reference_url`                        | refused (42501)                   |
| select the display columns                          | returned                          |
| image with `rights_status = 'not_cleared'`          | not returned                      |
| image of a `draft` object                           | not returned                      |
| insert as anon                                      | refused (42501)                   |
| object with embedded images and contacts            | returned; internal contact absent |
| directory rows with the embedded `is_primary` cover | one cover per row                 |

**Pages, with Playwright against `next start` on that stack.** The database held the real workbook's in-scope posts with their real column G URLs (902 published objects, 5,003 image rows). Contacts and access values were local fixtures marked `[Testa dati]`, because no real ones exist. Requests for the real image URLs were answered locally with a labelled stand-in picture of the requested size, since the image host is unreachable from here.

- No horizontal overflow at 360 px or 1280 px, on the directory and on an object page.
- Requested sizes matched the slot: `s384` for cards and thumbnails, `s828` for the desktop hero, `s640` for the mobile hero — never the multi-megapixel original.
- On a 360 px screen the directory requested 12 of 24 covers before scrolling.
- An aborted image request ended in the text fallback in the same box.
- An object with no images, contacts or access data rendered with none of those sections and the "not yet collected" access note.

**Screenshots** (`docs/day15-screenshots/`): `directory-desktop`, `directory-mobile`, `directory-mobile-fallback`, `detail-desktop`, `detail-mobile`, `detail-sparse-mobile`. The pictures in them are the stand-ins, not the real photographs; names and locations are real; `[Testa dati]` text is fixture data.

**Not verified:** real images loading from Blogger; anything against the real `muizasmanor26-dev` project.

## Known limitations

- **No image, contact or access data exists in the real project yet**, and no published object. The pages show those sections only once records exist.
- **Image dimensions are not stored.** The fixed-ratio box crops with `object-fit: cover`; a portrait photograph loses its top and bottom in a card or the hero. The gallery link opens the uncropped original.
- **`s<size>` constrains the longer side**, so a portrait image is served narrower than its `srcset` width claims and may look slightly soft.
- **Municipality in the local test data was a heuristic** (the first part of the free-text address). It is not the municipality mapping, which remains an open editorial task.
