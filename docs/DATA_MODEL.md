# Heritage-object data contract

This contract defines the minimum clean import format for more than 5,000 manor estates and related objects. The database migration will be created after representative records from the existing dataset have been mapped to these fields.

## Object identity and hierarchy

A manor estate is the primary business concept, but the database entity is a generic heritage object. This allows one estate to contain a main house, park, stable, ruin or other related object without duplicating the estate itself.

| Field                | Type              | Rule |
| -------------------- | ----------------- | ---- |
| `id`                 | UUID              | Internal immutable identifier |
| `source_system`      | text              | Stable name for the imported dataset |
| `external_source_id` | text              | Stable source identifier; unique with `source_system` |
| `object_type`        | enum              | `manor_estate`, `manor_house`, `palace_or_castle`, `park_or_garden`, `ruin_or_historical_site`, `outbuilding`, `other_heritage_object` |
| `parent_object_id`   | nullable relation | Parent estate or complex; cycles are forbidden |
| `slug`               | text              | Unique, stable, URL-safe identifier |

Imports use `source_system` plus `external_source_id` for idempotent upserts. A changed name must not create a second record.

## Required fields

| Field              | Type     | Rule |
| ------------------ | -------- | ---- |
| `name_lv`          | text     | Official or commonly accepted Latvian name |
| `slug`             | text     | Unique, stable, URL-safe identifier |
| `summary_lv`       | text     | Short factual introduction |
| `municipality`     | text     | Current municipality |
| `latitude`         | decimal  | Valid WGS84 latitude used during import |
| `longitude`        | decimal  | Valid WGS84 longitude used during import |
| `location`         | geography | PostGIS `geography(Point, 4326)`, generated or validated from coordinates |
| `status`           | enum     | `draft`, `review`, `published`, `archived` |
| `source_url`       | URL      | Principal source for verification |
| `last_verified_at` | datetime | Date the public facts were last checked |

## Classification fields used by filters

| Field                       | Type                   | Allowed values and rule |
| --------------------------- | ---------------------- | ----------------------- |
| `condition_category`        | nullable enum          | `historical_site`, `damaged`, `class_b`, `class_a` |
| `condition_notes_lv`        | nullable text          | Evidence-based explanation of the current condition |
| `ownership_type`            | nullable enum          | `private_person`, `private_legal_entity`, `municipality`, `state` |
| `ownership_verified_at`     | nullable date          | Date on which the public ownership classification was checked |
| `historical_owner_families` | relation, zero-to-many | Verified noble houses, families or dynasties associated with the object |

### Manor condition labels

| Stored value      | Public label     | Meaning |
| ----------------- | ---------------- | ------- |
| `historical_site` | Historical site  | The site is historically significant, but no main building survives |
| `damaged`         | Damaged building | The building is damaged; condition may range from irreparable to repairable |
| `class_b`         | Class B          | The building is standing and primarily needs cosmetic repairs |
| `class_a`         | Class A          | The building is pristine, fully restored or maintained to an equivalent standard |

The Class A and Class B labels are internal platform classifications, not official Latvian construction, cadastral or heritage designations. Public pages must explain this distinction.

### Ownership filter groups

| Public group | Stored values |
| ------------ | ------------- |
| Private      | `private_person`, `private_legal_entity` |
| Public       | `municipality`, `state` |

Ownership type describes the category of the current owner. The public website must not display a private individual's name unless there is a lawful basis and a clear product need.

### Historical owner families

An object may be associated with several families or noble houses across different periods. Use a separate many-to-many relation rather than one free-text field. Each association supports:

- family or dynasty name;
- alternate spellings;
- approximate start and end years;
- source URL or bibliographic reference;
- verification status.

## Contact information

Contact information uses a separate `object_contacts` relation because one object may have several contacts for different purposes.

| Field              | Type              | Rule |
| ------------------ | ----------------- | ---- |
| `object_id`        | relation          | Heritage object to which the contact belongs |
| `contact_type`     | enum              | `email`, `phone`, `website`, `address`, `social`, `booking` |
| `label`            | text              | Human-readable label, such as “Event enquiries” |
| `contact_value`    | text              | Email address, telephone number, URL or postal address |
| `purpose`          | enum              | `general`, `events`, `sales`, `press`, `administration` |
| `visibility`       | enum              | `public` or `internal` |
| `is_primary`       | boolean           | Marks the preferred contact for its purpose |
| `verified_at`      | nullable datetime | Date the contact was last verified |
| `source_url`       | nullable URL      | Public source used to verify the contact |
| `legal_basis_note` | nullable text     | Required when personal contact data is stored or published |

Public contact information and internal enquiry-routing information remain separate. Personal data must not be published without a documented lawful basis.

## Booking-platform integration

Booking support is a post-validation module, but the model may identify an object's primary booking platform without exposing credentials. Use a separate `object_booking_integrations` relation.

| Field                 | Type              | Rule |
| --------------------- | ----------------- | ---- |
| `object_id`           | relation          | Object connected to the platform |
| `platform_name`       | controlled text   | Provider name |
| `account_name`        | nullable text     | Non-secret account or property display name |
| `external_account_id` | nullable text     | Provider-issued non-secret account identifier |
| `external_listing_id` | nullable text     | Provider-issued listing identifier |
| `listing_url`         | nullable URL      | Public booking or property-listing page |
| `is_primary`          | boolean           | Identifies the main booking platform |
| `integration_mode`    | enum              | `external_link`, `manual`, `api` |
| `secret_reference`    | nullable text     | Name of a server-side secret; never the credential itself |
| `connection_status`   | enum              | `not_connected`, `pending`, `connected`, `error`, `disabled` |
| `last_synced_at`      | nullable datetime | Most recent successful synchronisation |
| `last_sync_error`     | nullable text     | Sanitised error without credentials or personal data |

Raw API keys, tokens, passwords and webhook secrets must never be stored in object rows, browser-accessible fields, GitHub, logs or analytics. Store credentials only in protected server-side secrets and keep at most a `secret_reference` in the database.

## Index and query requirements

- Unique index on `slug` and on `(source_system, external_source_id)`.
- GiST index on `location` for viewport and distance queries.
- B-tree indexes matching published-directory filters: `status`, `object_type`, `municipality`, `condition_category`, `ownership_type` and `parent_object_id`.
- GIN/trigram index over a maintained search document containing Latvian, alternate and historical names plus searchable location text.
- Composite/partial indexes should follow measured query plans, not speculation.
- Public queries must select a limited projection and enforce a maximum page size.
- Admin relations use foreign-key indexes and paginated queries.
- `created_at` and `updated_at` are required for audit and cache invalidation.

## Recommended fields

- Alternate and historical names.
- Address, postal code, region and parish/city.
- History and architecture description.
- Opening/access information.
- Event availability and indicative capacity.
- Accommodation and catering availability.
- Accessibility notes.
- Property-sale status and agent contact only after commercial validation.
- Image records with credit, rights, alt text and derivative sizes.
- Additional sources, record owner and audit timestamps.

## Data-quality and import rules

- Do not publish coordinates outside Latvia.
- Detect duplicates using stable source IDs first, then review name/location candidates manually.
- Validate parent relationships and reject hierarchy cycles.
- Do not infer condition, ownership or commercial services from photographs or old descriptions.
- Keep unknown values null instead of writing “no” or assigning an unverified category.
- Exclude null condition and ownership values from those filters until verified.
- Separate public contacts from internal enquiry-routing addresses.
- Do not publish private-owner personal data without a documented lawful basis.
- Validate contact URLs and normalise telephone numbers before import.
- Never store raw booking-platform credentials in the database or repository.
- Every image must have a documented reuse right.
- Publishing requires a source and verification date.
- Imports run in bounded batches, may be resumed safely and produce counts for inserted, updated, skipped and rejected rows.
