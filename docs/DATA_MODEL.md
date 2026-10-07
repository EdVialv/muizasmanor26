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

## Recommended fields

- Alternate and historical names.
- Address and postal code.
- Region and parish/city.
- History and architecture description.
- Opening/access information.
- Website, email and telephone.
- Event availability and indicative capacity.
- Accommodation and catering availability.
- Accessibility notes.
- Image records with credit, rights and alt text.
- Additional sources.
- Record owner and audit timestamps.

## Data-quality rules

- Do not publish coordinates outside Latvia.
- Do not infer commercial services from photographs or old descriptions.
- Keep unknown values null instead of writing “no.”
- Separate public contact details from internal enquiry-routing addresses.
- Every image must have a documented reuse right.
- Publishing requires a source and verification date.
