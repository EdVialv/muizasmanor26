# Contributing

## Prerequisites

- Node.js 24 LTS or newer supported release;
- npm, using the committed `package-lock.json`;
- local environment values copied from `.env.example`, never from production.

## Branches

Use one branch per issue:

- `feat/<short-name>`
- `fix/<short-name>`
- `docs/<short-name>`
- `codex/<short-name>`
- `claude/<short-name>`

Do not let Claude Code and Codex write to the same branch at the same time.

## Pull requests

Every pull request should:

- link its issue;
- explain what changed and what did not;
- include verification commands and results;
- note database migrations and environment variables;
- include screenshots for visible changes;
- remain small enough to review in one sitting.

## Required local checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

These same checks run automatically on every push to `main` and on every pull request via the `CI` GitHub Actions workflow (`.github/workflows/ci.yml`). A pull request cannot be considered verified until that workflow passes.

## Safety

- Never commit `.env*`, credentials, personal data or production exports.
- Never expose Supabase service-role, Resend or map-tile-provider secret tokens to browser code.
- Review AI-generated migrations, authentication logic and dependency changes manually.
- Preserve user-authored changes and resolve conflicts deliberately.
