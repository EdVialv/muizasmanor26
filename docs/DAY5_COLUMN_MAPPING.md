# Day 5 — source dataset column mapping

This is the Day 5 deliverable from `TODO.md`: map the owner's actual dataset onto the heritage-object fields in `docs/DATA_MODEL.md`, and record missing, conflicting and multi-value data **without changing source values**. No rows were transformed, renamed, slugged, classified or deduplicated here — that normalisation work is explicitly Day 6 (issue [#8](https://github.com/EdVialv/muizasmanor26/issues/8), "Define normalisation, stable IDs, parent–child mapping, duplicate detection and rejected-row rules"). This document only maps and documents; it does not decide.

The 25-record `data/sample/day4-representative-records.csv` remains an edge-case reference, per `TODO.md`, not a stand-in for this dataset.

## Source dataset

The owner supplied `muizasdb_pic.xlsx`, a single-sheet (`Lapa1`) export of a Latvian heritage-sites blog ("manasvietas.blogspot.com"). It is **denormalised one row per image**, with every post-level fact repeated on each of that post's image rows:

- 16,800 non-empty data rows (after dropping a duplicated header row and fully-empty rows).
- 11 source columns.
- Rows group into **3,716 unique blog posts** via `Bloga ieraksta Nr.` (blog-post number) — each post is a heritage-object candidate. The dataset owner confirmed that this number is permanent. It has no collisions or missing values, and there are no duplicate titles or post URLs, so it is a clean idempotent-import key: `source_system = manasvietas_blogspot`, `external_source_id = Bloga ieraksta Nr.`.
- Images per post range 1–56 (mean 4.52, median 3.0) — confirming this must land as a one-to-many image relation, not a single flattened image field.

Codex independently re-profiled the supplied workbook during review. The reviewed file is 9,799,262 bytes with SHA-256 `49e8ca0d5c61e22f91bcf5a2bdfb4a75a73704ae23b3545a8c26948f7b64f199`; this fingerprint distinguishes these counts from later exports.

## Column-by-column mapping

| Source column                  | Maps to                                                                                                                 | Notes                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Bloga ieraksta Nr.`           | `external_source_id` (with `source_system`)                                                                             | Unique per post (3,716/3,716); use as the import key.                                                                                                                                                                                                                                                                                                                 |
| `Bloga posta nosaukums`        | `name_lv` (candidate)                                                                                                   | Often carries alternate/historical names in parentheses, e.g. `Maisakrogs (Maisa krogs, Maisu krogs)`. Day 6 must decide how to split primary name from alternates rather than importing the whole string as `name_lv`.                                                                                                                                               |
| `Bloga ieraksta adrese (URL)`  | `source_url`                                                                                                            | One blog-post URL per post; consistently present.                                                                                                                                                                                                                                                                                                                     |
| `Adrese`                       | `municipality` (partial), free-text address, inline coordinates                                                         | Free text, not structured. Sometimes prefixed `Adrese:`, sometimes `Atrašanās vieta (Google Maps):`; 28 posts contain the literal placeholder `Adrese nav atrasta` ("address not found"). Municipality/parish is embeddable but needs parsing, not a 1:1 copy. Often repeats the same coordinates already in `Koordinātas` — see cross-validation below.              |
| `Koordinātas`                  | `latitude` / `longitude`                                                                                                | `"lat, lng"` text pair. 509 of 3,716 posts contain the literal placeholder `Koordinātas nav atrastas` ("coordinates not found"); 505 remain unresolved after repeated image rows are collapsed — see null-handling below.                                                                                                                                             |
| `Posta sekojošais teksts`      | `summary_lv` (source material), possible signal for `condition_notes_lv`, `ownership_type`, `historical_owner_families` | Long-form historical/descriptive body text, not a short summary as-is — Day 6 (or later editorial work) must excerpt rather than copy wholesale. Per `docs/DATA_MODEL.md`'s existing rule, condition and ownership must **not** be auto-inferred from this descriptive text; any classification drawn from it needs independent verification, same as Day 4's sample. |
| `Nr.`                          | _(unmapped)_                                                                                                            | Sequential row number of the spreadsheet export itself, not a stable identifier (it numbers image rows, not posts). Discard; do not import.                                                                                                                                                                                                                           |
| `Attēla nosaukums Drive`       | per-image record (future `object_images`-style relation)                                                                | Image filename on Drive. Per-image, not per-object; group by `Bloga ieraksta Nr.`.                                                                                                                                                                                                                                                                                    |
| `Hipersaite Google Drive`      | per-image record                                                                                                        | Google Drive hyperlink to the image file. Per-image.                                                                                                                                                                                                                                                                                                                  |
| `Attēla oriģinālā saite blogā` | per-image record                                                                                                        | Original in-blog image URL. Per-image.                                                                                                                                                                                                                                                                                                                                |
| `Attēla paraksts`              | per-image record (caption/alt text)                                                                                     | Blank in 99.9% of rows — effectively unused in this export. Do not rely on it for alt text.                                                                                                                                                                                                                                                                           |

Four of the eleven source columns (`Attēla nosaukums Drive`, `Hipersaite Google Drive`, `Attēla oriģinālā saite blogā`, `Attēla paraksts`) are per-image, not per-object. `docs/DATA_MODEL.md` already lists "Image records with credit, rights, alt text and derivative sizes" under Recommended fields but has not yet defined that relation's schema — this dataset's per-image columns should inform that definition when it is written.

The dataset owner states that these images may be used with attribution to the source. Import must therefore retain the original blog image URL and source reference for every image. A later content-review stage will assess and record more specific copyright or licence details; Drive links alone are storage references and must not be treated as attribution or licence evidence.

## Target fields with no source column at all

These `docs/DATA_MODEL.md` fields have nothing to map from in this dataset and must stay null on import, be derived through separate editorial work, or wait for a later data source:

- `object_type` — not a column; would need derivation from title/body-text keywords, and that derivation is a classification decision, not a mapping, so it is left to Day 6 (see the object-type coverage finding below for why it is not a simple keyword rule).
- `slug` — must be generated, not copied; no source column is URL-safe or guaranteed unique on its own.
- `parent_object_id` — this dataset has no hierarchy signal at all (no post references another post as its parent). Hierarchy, if any, would have to come from manual review, like Day 4's sample.
- `status`, `last_verified_at` — not present; every imported row would need these set by the import process itself, not copied from source.
- `condition_category`, `ownership_type`, `ownership_verified_at`, `historical_owner_families` — no structured columns; only mineable from `Posta sekojošais teksts` free text, and per the existing data-quality rule, not safe to auto-populate from it without independent verification.
- `object_cadastre_references` (`reference_type`, `reference_value`, etc.) — entirely absent from this dataset; cadastral references still require a separate manual lookup or future Kadastrs API match, exactly as already documented in `docs/DATA_MODEL.md`.

## Null-handling: literal "not found" placeholders

The source does not use true blanks when a fact wasn't found during the original scrape — it writes a literal Latvian placeholder string instead. These must be converted to real `null` on import, never imported as text, per `docs/DATA_MODEL.md`'s existing rule ("Keep unknown values null instead of writing 'no' or assigning an unverified category"):

| Placeholder string             | Column(s)                 | Occurrences (of 3,716 posts)                                                                      |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `Koordinātas nav atrastas`     | `Koordinātas`             | 509 contain the placeholder; 505 remain unresolved after preferring a real value from another row |
| `Adrese nav atrasta`           | `Adrese`                  | 28 contain the placeholder; 26 remain unresolved after preferring a real value from another row   |
| (various "not found" phrasing) | `Posta sekojošais teksts` | 9 posts contain `nav atrast*` phrasing                                                            |
| —                              | `Bloga posta nosaukums`   | 0 — every post has a real title                                                                   |

## Conflicting and inconsistent values found

### Within-post inconsistency across a post's own image rows

Grouping all 16,800 image rows by `Bloga ieraksta Nr.` and comparing values within each post surfaced a small number of posts where different image rows disagree on a supposedly post-level fact:

- 2 posts with inconsistent `Adrese`.
- 4 posts with inconsistent `Koordinātas`.
- 12 posts with inconsistent `Posta sekojošais teksts`.
- 0 posts with inconsistent title.

All 4 coordinate-inconsistent posts follow the same pattern: some of the post's image rows carry a real coordinate value and others carry the `Koordinātas nav atrastas` placeholder, rather than two different real values genuinely disagreeing. The resolution rule for Day 6 should be: prefer the real value over the placeholder when collapsing a post's image rows into one object record. The 4 posts are `Ģibotu muiža (Gibdorn, Gibati)` (post 1932), `Aijažu muiža (Ayasch, Ayzell)` (post 2012), `Bērzu muiža (Bērzmuiža, Bērziņu muiža, Bershof) Bikstos` (post 2111, also one of the 2 address-inconsistent posts), and `Baronu Firksu apbedījumi Pūpju kapos` (post 2113, also address-inconsistent).

### Cross-column coordinate validation

2,632 posts carry a coordinate pair in both the dedicated `Koordinātas` column and the `Adrese` text, either as an inline parenthetical pair or inside a Google Maps URL. Comparing the two copies within each post: all 2,632 agree. A naive parser falsely flags five as sign disagreements because the label separator in text such as `koordinātes -56.13...` resembles a minus sign; it is not part of the latitude. This is useful corroboration: where both are present, they are reliable duplicates of each other, not independent facts to reconcile.

### Coordinates outside Latvia's bounding box

17 of the 3,716 posts have a parsed `Koordinātas` value outside an approximate Latvia bounding box (roughly lat 55.0–58.5, lon 19.5–29.0), which `docs/DATA_MODEL.md`'s existing rule ("Do not publish coordinates outside Latvia") flags as needing review before publishing:

- **15 are legitimate foreign locations**, not errors: 13 in Poland (post IDs 400–404, 3103, 3104, 3167, 3227, 3239, 3240, 3403 and 3442), Palmse Manor in Estonia (3520), and Radvila Palace in Vilnius, Lithuania (3524). They should remain in the source archive but stay out of the Latvia-only public directory and map unless the product scope is broadened.
- **2 are malformed Latvian source coordinates**: `Dzelzceļa tilts pie bijušās stacijas "Ozoli" Limbažu novadā` (`7.639312,24.941016`) and `Grāvendāles skola (Pārupes skola) Rundāles novadā` (`53.3404356,24.0215136`). Per the "do not guess" rule already in `docs/DATA_MODEL.md`, these should be nulled rather than auto-corrected, pending a manual re-check against the original blog post.

## Object-type coverage: an open scope question for Day 6

A keyword scan of `Bloga posta nosaukums` against the current `object_type` enum's natural-language equivalents shows this dataset is materially broader than manors alone. The keyword groups overlap: 112 posts match more than one group, so the category counts must not be summed as a distribution. The `pils` rule uses word boundaries so place names such as Ventspils, Jēkabpils and Mālpils are not falsely counted as castles.

| Keyword group (Latvian)                       | Posts matched (of 3,716) |
| --------------------------------------------- | -----------------------: |
| `muiž*` (manor)                               |            1,691 (45.5%) |
| `baznīc*`/`dievnams`/`katedrāl*` (church)     |                      368 |
| `dzirnav*` (mill)                             |                      324 |
| `skola` (school)                              |                      231 |
| `kapi`/`kapsēta`/`apbedīj*` (cemetery/burial) |                      203 |
| standalone `pils`/`pilsdrupas`/`pilskalns`    |                      122 |
| `stacij*` (station)                           |                       71 |
| `tilts` (bridge)                              |                       23 |
| `drupas`/`ruin*` (ruin)                       |                        9 |
| none of the above                             |              787 (21.2%) |

The "none of the above" group alone (787 posts; examples include taverns/`krogs`, natural rock outcrops/`iezis`, war memorials, villas, a dairy and an observation tower) does not fit cleanly into the current `other_heritage_object` catch-all without losing useful distinctions. The other keyword counts also contain overlaps and must not be treated as mutually exclusive totals. Whether to broaden the `object_type` enum, treat most non-manor content as out of scope, or import it under `other_heritage_object` with a controlled subtype is a product/schema decision for Day 6.

## Summary for Day 6

- Use `source_system = manasvietas_blogspot` + `external_source_id = Bloga ieraksta Nr.` as the idempotent import key; it is clean (no duplicates).
- Collapse each post's image rows into one object record, preferring a real value over a `*nav atrast*` placeholder when rows disagree (only 4 posts for coordinates, 2 for address).
- Convert all `*nav atrast*` placeholder strings to null; do not import them as text. After collapsing repeated image rows, 505 posts remain without coordinates and 26 remain without an address.
- Carry both `Koordinātas` and the inline `Adrese` coordinates forward as corroborating, not independent, sources.
- Null the 2 malformed-latitude coordinate rows pending manual re-check; retain the 15 genuine foreign posts in source provenance but exclude them from the Latvia-only directory and map unless the product scope changes.
- Preserve every image's original blog URL and source attribution. More detailed copyright or licence assessment is a later content-review task.
- Resolve the `object_type` scope question above before import, since it affects the majority of non-manor posts.
- `parent_object_id`, `object_cadastre_references`, `condition_category`, `ownership_type` and `historical_owner_families` have no source signal in this dataset and must be populated later through manual review, exactly as in the Day 4 sample — not inferred from `Posta sekojošais teksts` during import.
