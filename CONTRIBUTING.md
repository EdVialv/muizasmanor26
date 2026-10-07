# Contributing

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
npm run typecheck
npm run build
```

Testing and lint commands will be added when their configurations land.

## Safety

- Never commit `.env*`, credentials, personal data or production exports.
- Never expose Supabase service-role, Resend or Mapbox secret tokens to browser code.
- Review AI-generated migrations, authentication logic and dependency changes manually.
- Preserve user-authored changes and resolve conflicts deliberately.
