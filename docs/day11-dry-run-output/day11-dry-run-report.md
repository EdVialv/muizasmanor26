# Day 11 dry-run report (generated, not edited by hand)

Source file: `b8c72ee8-muizasdb_pic.xlsx`
SHA-256: `0721c7a8342cf3f118b3cd464d784e67ed6722f940eeb2f47ac077415ceb460e`
Size: 10541965 bytes
Generated: 2026-11-06T20:46:25.063Z

## Totals

- Total image rows (after dropping the duplicated header row): 16800
- Rows with no post id (excluded from grouping): 0
- Collapsed posts: 3716

## Scope decision (section 1 - a confirmed, reversible decision; see docs/DAY11_DRY_RUN_NOTES.md decision 10)

Every post now has a real in_scope / archived_out_of_scope decision, not just a proposal. The title-only keyword scan (raw signal, kept below for audit) is extended by a second pass over each post's own body text: a tight phrase-based regex looks for explicit manor-complex-membership language (e.g. "muižas komplekss", "piederēja muižai", "bijušās muižas") that the title alone would miss. This is still text-signal-based (title + body only), not a manual review of each post's photos/context, and archived_out_of_scope remains a real but reversible decision - the post keeps its stable identity and is never deleted.

### Confirmed decision counts

- in_scope: 1553
- archived_out_of_scope: 2163

### Decision basis (why each post landed where it did)

- title_keyword (title alone named a manor/palace/castle/hillfort/ruin): 1452
- body_text_affiliation_phrase (title didn't, but body text used an explicit manor-affiliation phrase): 101
- no_signal_found (neither title nor body text gave a signal; archived): 2163

### Sample of posts reclassified to in_scope via body-text phrase (30 shown)

- **110** "Cēsis, grāfa Karla Gustava fon Zīversa krūšutēls" - matched phrase: "pils muižu"
- **267** "Jūrmala, Raiņa vasarnīca Jaundubultos (Raiņa sēta)" - matched phrase: "muižu pārvaldnieka"
- **311** "Krustpils, Latvijas armijas kazarmas" - matched phrase: "muižas teritorijā"
- **314** "Kokmuižas ūdensdzinavas (Brandeļu HES)" - matched phrase: "muižas dzirnavas"
- **434** "Smiltene, Bērensa dzimtas kapliča pilsētas kapos" - matched phrase: "muižas pārvaldnieka"
- **467** "Iecava, tilts pār Ģedules upīti" - matched phrase: "muižas parkā"
- **515** "Rites skola (Ilzu skola, Rites tautskola)" - matched phrase: "muižas teritorijā"
- **554** "Cēsis, L.Ausēja reālskola" - matched phrase: "muižas pārvaldniekam"
- **565** "Cīravas baznīca" - matched phrase: "muižas parka"
- **591** "Rotkaļu pusmuiža (Rotkaln) Tumes pagastā" - matched phrase: "muižas teritorijā"
- **596** "Ozolnieku skola (Ozolmuižas skola) Jelgavas novadā" - matched phrase: "muižas skola"
- **624** "Lielvārde, Rumbiņas ūdenskritums" - matched phrase: "muižas parkā"
- **633** "Praulienas mācītājmuiža (Lazdonas mācītājmuiža)" - matched phrase: "muižas teritorijā"
- **647** "Mežzīles ūdensdzirnavas" - matched phrase: "muižas dzirnavas"
- **665** "Sofijas pusmuiža (Kaķīšu pusmuiža) Siguldā" - matched phrase: "muižas saimniecība"
- **764** "Vangas ūdensdzirnavas" - matched phrase: "muižas dzirnavu"
- **880** "Kuķēnu pusmuiža (Lejaskuķēnu pusmuiža un Kalna Kuķēnu pusmuiža, Kuiken)" - matched phrase: "bijušajiem muižas"
- **966** "Vārves un Zūru pagastu deportēto iedzīvotāju piemiņas akmens" - matched phrase: "muižas teritorijā"
- **968** "Pasiekstes vējdzirnavas" - matched phrase: "muižas teritorijā"
- **994** "Mordangas ūdensdzirnavas (Mordangu ūdensdzirnavas)" - matched phrase: "muižas parkā"
- **1014** "Matīšu baznīca" - matched phrase: "muižas pils"
- **1023** "Pociema skola (Pīlāgu skola)" - matched phrase: "muižas pils"
- **1075** "Jumpravas ūdenskritums (Jumpravmuižas ūdenskritums) Mežotnes pagastā" - matched phrase: "muižas parkā"
- **1093** "Grašu ūdensdzirnavas" - matched phrase: "muižas dzirnavām"
- **1143** "Ēdoles mācītājmuiža" - matched phrase: "muižas dzirnavu"
- **1222** "Akenstakas ūdensdzirnavas (Klingenbergas ūdensdzirnavas)" - matched phrase: "muižas dzirnavām"
- **1223** "Bērzaunes pamatskola" - matched phrase: "muižas skolās"
- **1272** "Krustpils ūdensdzirnavas" - matched phrase: "muižas dzirnavās"
- **1285** "Felicianovas ūdensdzirnavas" - matched phrase: "piederēja muižkungam"
- **1299** "Ērgļu mācītājmuiža" - matched phrase: "muižas teritoriju"

### Raw title-only keyword triage (kept for audit/comparison only)

- in_scope_candidate: 1452
- out_of_scope_candidate: 821
- ambiguous_no_keyword_match: 1443

## Proposed staging status (none of this is written anywhere; derived from the confirmed scope decision above)

- needs_review: 1553
- archived_out_of_scope: 2163

## Field-level findings

- Posts with no resolved coordinates after collapse: 505
- Posts with no resolved address after collapse: 26
- Posts with coordinates outside the approximate Latvia bounding box: 17
- Posts with unparseable (non-placeholder) coordinate text: 0
- Posts with >1 distinct address value across their own image rows: 2
- Posts with >1 distinct coordinate value across their own image rows: 4
- Posts with >1 distinct body-text value across their own image rows: 12
- Slug base-name collision groups (resolved via location-hint/external-id suffix): 72

## Per-image identity source (section 6; drive_file_id preferred, original_url then content_hash as fallbacks)

- drive_file_id: 16800
- original_url: 0
- content_hash: 0

## Issue frequency (by issue type)

- missing required fields: 4221
- scope decision: 101
- missing required field: 26
- coordinates fall outside the approximate Latvia bounding box: 17

## Duplicate candidates (section 4; never auto-merged): 165

These need manual review to decide: same object (keep the better-sourced post, archive the other), a parent/child relationship, or two legitimately separate objects.

- [name_match] 219 <-> 763: normalized primary name "vegu muiza" matches
- [name_match] 352 <-> 1161: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 1306: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 1647: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 1822: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 2053: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 2087: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 2675: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 2896: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 2901: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 2948: normalized primary name "jauna muiza" matches
- [name_match] 352 <-> 3231: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 1306: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 1647: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 1822: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 2053: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 2087: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 2675: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 2896: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 2901: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 2948: normalized primary name "jauna muiza" matches
- [name_match] 1161 <-> 3231: normalized primary name "jauna muiza" matches
- [name_match] 1306 <-> 1647: normalized primary name "jauna muiza" matches
- [name_match] 1306 <-> 1822: normalized primary name "jauna muiza" matches
- [name_match] 1306 <-> 2053: normalized primary name "jauna muiza" matches
- [name_match] 1306 <-> 2087: normalized primary name "jauna muiza" matches
- [name_match] 1306 <-> 2675: normalized primary name "jauna muiza" matches
- [name_match] 1306 <-> 2896: normalized primary name "jauna muiza" matches
- [name_match] 1306 <-> 2901: normalized primary name "jauna muiza" matches
- [name_match] 1306 <-> 2948: normalized primary name "jauna muiza" matches
- [name_match] 1306 <-> 3231: normalized primary name "jauna muiza" matches
- [name_match] 1647 <-> 1822: normalized primary name "jauna muiza" matches
- [name_match] 1647 <-> 2053: normalized primary name "jauna muiza" matches
- [name_match] 1647 <-> 2087: normalized primary name "jauna muiza" matches
- [name_match] 1647 <-> 2675: normalized primary name "jauna muiza" matches
- [name_match] 1647 <-> 2896: normalized primary name "jauna muiza" matches
- [name_match] 1647 <-> 2901: normalized primary name "jauna muiza" matches
- [name_match] 1647 <-> 2948: normalized primary name "jauna muiza" matches
- [name_match] 1647 <-> 3231: normalized primary name "jauna muiza" matches
- [name_match] 1822 <-> 2053: normalized primary name "jauna muiza" matches
- [name_match] 1822 <-> 2087: normalized primary name "jauna muiza" matches
- [name_match] 1822 <-> 2675: normalized primary name "jauna muiza" matches
- [name_match] 1822 <-> 2896: normalized primary name "jauna muiza" matches
- [name_match] 1822 <-> 2901: normalized primary name "jauna muiza" matches
- [name_match] 1822 <-> 2948: normalized primary name "jauna muiza" matches
- [name_match] 1822 <-> 3231: normalized primary name "jauna muiza" matches
- [name_match] 2053 <-> 2087: normalized primary name "jauna muiza" matches
- [name_match] 2053 <-> 2675: normalized primary name "jauna muiza" matches
- [name_match] 2053 <-> 2896: normalized primary name "jauna muiza" matches
- [name_match] 2053 <-> 2901: normalized primary name "jauna muiza" matches
- ... and 115 more (see the JSON report)

## Relationship candidates (section 4; within 500m, never auto-linked): 92

- 401 <-> 402: 468.2m apart
- 427 <-> 428: 116.0m apart
- 565 <-> 3675: 112.6m apart
- 624 <-> 3241: 413.3m apart
- 764 <-> 765: 140.0m apart
- 860 <-> 1075: 149.4m apart
- 860 <-> 2533: 198.1m apart
- 860 <-> 3562: 479.5m apart
- 966 <-> 967: 234.1m apart
- 1075 <-> 2533: 132.1m apart
- 1075 <-> 3562: 334.8m apart
- 1222 <-> 2835: 72.4m apart
- 1265 <-> 1266: 131.2m apart
- 1303 <-> 1304: 101.8m apart
- 1460 <-> 3609: 437.6m apart
- 1473 <-> 1482: 385.4m apart
- 1475 <-> 1477: 236.5m apart
- 1518 <-> 1519: 416.2m apart
- 1559 <-> 1599: 417.8m apart
- 1591 <-> 1592: 98.0m apart
- 1620 <-> 2841: 473.2m apart
- 1680 <-> 2432: 481.3m apart
- 1829 <-> 1830: 67.8m apart
- 1903 <-> 1907: 59.9m apart
- 1918 <-> 1919: 244.3m apart
- 1940 <-> 2806: 309.0m apart
- 1943 <-> 1944: 57.8m apart
- 1949 <-> 2613: 437.6m apart
- 2017 <-> 2025: 407.6m apart
- 2023 <-> 2025: 179.1m apart
- 2120 <-> 3683: 187.1m apart
- 2125 <-> 2126: 315.4m apart
- 2222 <-> 3014: 266.1m apart
- 2250 <-> 2508: 447.1m apart
- 2292 <-> 3211: 281.8m apart
- 2350 <-> 2486: 70.4m apart
- 2422 <-> 2831: 178.0m apart
- 2449 <-> 2648: 450.6m apart
- 2497 <-> 2498: 269.3m apart
- 2497 <-> 3123: 428.9m apart
- 2498 <-> 3123: 240.1m apart
- 2524 <-> 2703: 238.1m apart
- 2524 <-> 2845: 398.6m apart
- 2531 <-> 3102: 296.1m apart
- 2533 <-> 3562: 396.0m apart
- 2541 <-> 3527: 408.5m apart
- 2572 <-> 2573: 295.7m apart
- 2579 <-> 3243: 170.3m apart
- 2580 <-> 2855: 295.2m apart
- 2580 <-> 3679: 89.3m apart
- ... and 42 more (see the JSON report)

## Representative sample issues (20 of 3716 posts)

- **11** "Dagdas katoļu baznīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **12** "Dagdas pareizticīgo baznīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **14** "Dagdas ūdensdzirnavas"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **16** "Aisbahovas muiža (Eisbahovas muiža, Priežmales muiža, Askirku muiža, Oskierko)"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **19** "Valmieras kurlmēmo skola"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **22** "Ventspils dzelzceļa stacija"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **24** "Limbažu filca fabrika (Cepuru fabrika)"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **26** "Lielsalacas luterāņu baznīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **34** "Limbažu slimnīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **42** "Ilūkstes luterāņu baznīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **56** "Ainažu dzelzceļa stacija"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **57** "Ainažu pareizticīgo baznīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **65** "Ērgļu luterāņu baznīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **67** "Aknīstes katoļu baznīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **68** "Aknīstes luterāņu baznīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **70** "Jelgavas ebreju slimnīca"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **71** "Liepājas lokomotīvju ūdenstornis"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **73** "Liepājas muzejs"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **74** "Liepājas Jūrniecības koledža"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
- **75** "Liepājas dzirnavas"
  - missing required fields: object_type, summary_lv, last_verified_at, municipality
  - missing required fields: latitude, longitude
