# Technical architecture

## Principles

- Keep the MVP as one Next.js application.
- Prefer managed services over custom infrastructure.
- Keep secrets on the server and out of Git.
- Use Supabase Row Level Security as a mandatory boundary, not an optional hardening step.
- Store source and last-verified metadata for every manor record.
- Add commercial modules only after product validation.

## Service responsibilities

| Concern | Service |
|---|---|
| Web application and server routes | Next.js + TypeScript |
| Source control and review | GitHub |
| Hosting and preview deployments | Vercel |
| Database, authentication and image storage | Supabase |
| DNS, caching and edge protection | Cloudflare |
| Transactional enquiry emails | Resend |
| Maps and geocoding | Mapbox |
| Error and performance monitoring | Sentry |
| Product analytics | PostHog |

## Initial application areas

- `/` — introduction and discovery entry point.
- `/manors` — searchable directory and filters.
- `/manors/[slug]` — individual manor page.
- `/map` — interactive map.
- `/admin` — protected content management.
- `/api/enquiries` — validated server-side enquiry intake.

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
