# Shared progress log

This file is the handoff record shared by **Codex**, **Claude Code** and the project owner.

Read it before starting a session and update it before ending a session.

## Coordination rules

1. Work on only one clearly identified GitHub issue per session.
2. Create a dedicated branch before changing project files.
3. Codex and Claude Code must never write to the same branch simultaneously.
4. Record the active agent, branch and issue in **Current work** before implementation.
5. Pull the latest `main` before starting and before handing work to the other agent.
6. At the end of a session, record files changed, verification results, decisions, blockers and the exact next action.
7. Do not record API keys, tokens, passwords, personal data or other secrets here.
8. Do not mark work complete unless the listed verification commands actually passed.
9. Keep historical session entries; correct mistakes with a new note rather than silently deleting the record.
10. When a pull request is merged, clear **Current work** and update **Project position**.

## Project position

- **Current roadmap day:** Day 2
- **Last completed day:** Day 1
- **Next issue:** [#5 — Set up development quality and CI baseline](https://github.com/EdVialv/muizasmanor26/issues/5)
- **Next outcome:** Commit the npm lockfile, configure ESLint and formatting, and verify a clean install, type check and production build.
- **MVP status:** Foundation complete; development quality baseline not yet started.
- **Detailed plan:** [TODO.md](TODO.md)

## Current work

Update this section when a session starts. Only one write-enabled session should be active.

| Field | Current value |
|---|---|
| Status | Idle |
| Agent | None |
| Issue | None |
| Branch | None |
| Session goal | None |
| Started | None |
| Expected handoff | Start Day 2 from issue #5 |

## Required session entry

Copy this template to the top of **Session history** before ending a session.

```markdown
### YYYY-MM-DD HH:MM Europe/Riga — Codex or Claude Code

- **Issue:** #number — title
- **Branch:** branch-name
- **Pull request:** #number or not opened
- **Session goal:** one sentence
- **Completed:**
  - concrete result
- **Files changed:**
  - path — short explanation
- **Verification:**
  - `command` — passed, failed or not run
- **Decisions:**
  - decision and reason
- **Blockers or risks:**
  - blocker, risk or none
- **Next exact action:**
  - one action another agent can start without guessing
- **Handoff state:** clean, uncommitted changes, awaiting review, blocked or merged
```

## Session history

Add the newest completed session immediately below this heading.

### 2026-10-07 17:26 Europe/Riga — Codex

- **Issue:** Documentation coordination requested by project owner
- **Branch:** `codex/add-shared-progress-log`
- **Pull request:** pending at time of entry
- **Session goal:** Create a shared progress and handoff file for Codex and Claude Code.
- **Completed:**
  - created a common session protocol;
  - added current project position and active-work tracking;
  - added a mandatory session-entry template;
  - recorded the existing project foundation and next action.
- **Files changed:**
  - `PROGRESS.md` — shared status, coordination and handoff log;
  - `README.md` — documentation links updated.
- **Verification:**
  - Markdown structure and repository links — reviewed manually.
- **Decisions:**
  - use one shared log and sequential branches;
  - never store credentials or personal data in progress entries.
- **Blockers or risks:**
  - simultaneous edits to this file can cause merge conflicts; agents must work sequentially.
- **Next exact action:**
  - merge this documentation pull request, then start Day 2 from issue #5 on a new branch.
- **Handoff state:** awaiting review

### 2026-10-07 — Codex project foundation

- **Issue:** [#1 — Day 1 foundation](https://github.com/EdVialv/muizasmanor26/issues/1)
- **Pull requests:** [#2](https://github.com/EdVialv/muizasmanor26/pull/2), [#3](https://github.com/EdVialv/muizasmanor26/pull/3), [#4](https://github.com/EdVialv/muizasmanor26/pull/4), [#14](https://github.com/EdVialv/muizasmanor26/pull/14)
- **Completed:**
  - defined MVP scope, architecture and initial data contract;
  - added buyer and real-estate-agent personas;
  - added condition, ownership and historical-family classifications;
  - added structured contacts and booking-platform integration fields;
  - created the Next.js and TypeScript application shell;
  - created the 30-evening roadmap and phase issues.
- **Verification:**
  - `npm install` — passed;
  - `npm run typecheck` — passed;
  - `npm run build` — passed.
- **Next exact action:** Complete Day 2 through issue #5.
- **Handoff state:** merged
