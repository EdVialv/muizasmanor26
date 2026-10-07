# Manor data contract

This contract defines the minimum clean import format. The database migration will be created after a sample of the existing dataset has been mapped to these fields.

## Required fields

| Field | Type | Rule |
|---|---|---|
| `name_lv` | text | Official or commonly accepted Latvian name |
| `slug` | text | Unique, stable, URL-safe identifier |
| `summary_lv` | text | Short factual introduction |
| `municipality` | text | Current municipality |
| `latitude` | decimal | Valid WGS84 latitude |
| `longitude` | decimal | Valid WGS84 longitude |
| `status` | enum | `draft`, `review`, `published`, `archived` |
| `source_url` | URL | Principal source for verification |
| `last_verified_at` | datetime | Date the public facts were last checked |

## Classification fields used by filters

| Field | Type | Allowed values and rule |
|---|---|---|
| `condition_category` | nullable enum | `historical_site`, `damaged`, `class_b`, `class_a` |
| `condition_notes_lv` | nullable text | Evidence-based explanation of the current condition |
| `ownership_type` | nullable enum | `private_person`, `private_legal_entity`, `municipality`, `state` |
| `ownership_verified_at` | nullable date | Date on which the public ownership classification was checked |
| `historical_owner_families` | relation, zero-to-many | Verified noble houses, families or dynasties associated with the estate |

### Manor condition labels

| Stored value | Public label | Meaning |
|---|---|---|
| `historical_site` | Historical site | The manor site is historically significant, but no manor building survives |
| `damaged` | Damaged building | The building is damaged; condition may range from irreparable to repairable |
| `class_b` | Class B | The building is standing and primarily needs cosmetic repairs |
| `class_a` | Class A | The building is pristine, fully restored or maintained to an equivalent standard |

The Class A and Class B labels are internal platform classifications, not official Latvian construction, cadastral or heritage designations. Public pages must explain this distinction.

### Ownership filter groups

| Public group | Stored values |
|---|---|
| Private | `private_person`, `private_legal_entity` |
| Public | `municipality`, `state` |

Ownership type describes the category of the current owner. The public website must not display a private individual's name unless there is a lawful basis and a clear product need.

### Historical owner families

A manor may be associated with several families or noble houses across different periods. These values should therefore use a separate many-to-many relation rather than one free-text field. Each association should support:

- family or dynasty name;
- alternate spellings;
- approximate start and end years;
- source URL or bibliographic reference;
- verification status.

## Recommended fields

- Alternate and historical manor names.
- Address and postal code.
- Region and parish/city.
- History and architecture description.
- Opening/access information.
- Website, email and telephone.
- Event availability and indicative capacity.
- Accommodation and catering availability.
- Accessibility notes.
- Property-sale status and agent contact only after commercial validation.
- Image records with credit, rights and alt text.
- Additional sources.
- Record owner and audit timestamps.

## Data-quality rules

- Do not publish coordinates outside Latvia.
- Do not infer condition, ownership or commercial services from photographs or old descriptions.
- Keep unknown values null instead of writing “no” or assigning an unverified category.
- Exclude null condition and ownership values from those filters until verified.
- Separate public contact details from internal enquiry-routing addresses.
- Do not publish private-owner personal data without a documented lawful basis.
- Every image must have a documented reuse right.
- Publishing requires a source and verification date.
