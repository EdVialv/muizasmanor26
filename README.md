# Latvijas muižas

A responsive web platform for discovering Latvian manor estates and sending event enquiries.

## MVP

The first release will provide:

- a public manor directory;
- keyword search and practical filters;
- an interactive map;
- individual manor pages;
- an administration interface;
- event-enquiry forms and email notifications.

Bookings, payments, subscriptions, premium listings, route planning, restoration-provider listings and funding assistance are deliberately deferred until the MVP is validated.

## Stack

Next.js, TypeScript, Vercel, Supabase, Cloudflare, Resend, Mapbox, Sentry and PostHog.

## Local development

Requirements: Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Documentation

- [30-evening roadmap](TODO.md)
- [Shared Codex and Claude Code progress log](PROGRESS.md)
- [MVP scope](docs/MVP_SCOPE.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Manor data contract](docs/DATA_MODEL.md)
- [Contributing workflow](CONTRIBUTING.md)

## Working method

Changes are developed on focused branches and reviewed through pull requests. Claude Code may implement features; Codex may review, debug and test them. Never let both tools edit the same branch simultaneously.

Before starting work, both assistants must read `PROGRESS.md`. Before ending a session, the active assistant must update its current-work status and add a complete handoff entry.
