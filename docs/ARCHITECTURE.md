# Technical architecture

## Principles

- Keep the MVP as one Next.js application.
- Prefer managed services over custom infrastructure.
- Keep secrets on the server and out of Git.
- Use Supabase Row Level Security as a mandatory boundary, not an optional hardening step.
- Store source and last-verified metadata for every heritage-object record.
- Treat 5,000 objects as the launch baseline and retain headroom for at least 10,000 without redesigning the core.
- Add commercial modules only after product validation.

## Scale and performance baseline

The directory will contain more than 5,000 manor estates and related heritage objects. The application must therefore avoid designs that fetch, render or administer the complete collection at once.

- Public and admin lists use server-side cursor pagination. A normal page returns 24–48 lightweight records.
- Search, filtering, sorting and pagination run in PostgreSQL, not over a client-side copy of the dataset.
- Coordinates are stored as a PostGIS `geography(Point, 4326)` value with a GiST spatial index.
- Frequently filtered fields use appropriate B-tree indexes; multilingual name search uses a maintained search document with GIN/trigram indexes.
- The map endpoint accepts bounding-box, zoom and filter parameters and returns only lightweight records visible in the current viewport.
- Leaflet uses clustering and canvas-preferred rendering. The browser must not create thousands of individual DOM markers.
- Detail content and full-resolution images are loaded only when needed. Thumbnails are responsive, lazy-loaded and CDN cached.
- Public queries are cacheable; database access uses connection pooling and bounded result sizes.
- Import jobs are idempotent, batched, resumable and produce a rejection report.
- Performance tests use at least 10,000 generated objects so the initial dataset is not the test ceiling.

## Service responsibilities

| Concern                                    | Service                                         |
| ------------------------------------------ | ----------------------------------------------- |
| Web application and server routes          | Next.js + TypeScript                            |
| Source control and review                  | GitHub                                          |
| Hosting and preview deployments            | Vercel                                          |
| Database, authentication and image storage | Supabase + PostgreSQL/PostGIS                   |
| DNS, caching and edge protection           | Cloudflare                                      |
| Transactional enquiry emails               | Resend                                          |
| Interactive maps                           | Leaflet + production OSM-compatible tile vendor |
| Error and performance monitoring           | Sentry                                          |
| Product analytics                          | PostHog                                         |

Leaflet is the map library, not a source of map tiles. Production must use a tile service whose capacity, attribution and usage terms match the expected traffic; do not rely on the community OpenStreetMap tile server as an unlimited production backend.

## Initial application areas

- `/` — introduction and discovery entry point.
- `/objects` — searchable directory and filters; `/manors` may remain a user-facing alias.
- `/objects/[slug]` — individual heritage-object page.
- `/map` — interactive viewport-driven map.
- `/admin` — protected, paginated content management.
- `/api/objects` — bounded directory and map queries.
- `/api/enquiries` — validated server-side enquiry intake.

## Query shape

Directory requests contain a cursor, page size, sort order and validated filters. Map requests additionally contain a bounding box and zoom level. Both return a deliberately small public projection rather than database rows with contacts, audit metadata or long descriptions.

At low zoom levels, the map returns clusters. At higher zoom levels it returns visible object markers. Selecting a result fetches summary or detail data separately. Search and filter state stays in URL parameters so results are shareable and recoverable.

## Environments

- Local: developer machine with non-production credentials.
- Preview: one isolated Vercel deployment per pull request.
- Production: protected production project and database.

Never reuse the production Supabase service-role key in local or preview environments.

## Delivery workflow

1. Create or select one GitHub issue.
2. Create a dedicated branch.
3. Implement one coherent change.
4. Run formatting, type checking, tests and build.
5. Open a pull request and inspect the preview.
6. Review with Codex; fix findings on the same branch.
7. Merge only after checks pass.
