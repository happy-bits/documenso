# Testing Guide

This guide explains what tests exist in Documenso, why they exist, and how to run them — including how to break one on purpose, so you can see the safety net in action before you start changing real code.

> **Prerequisite:** this guide assumes your local dev environment is already set up (Node, Docker services, database migrated and seeded). If it isn't, run the `getting-started` skill first (`/getting-started` in Claude Code, or see `CONTRIBUTING.md`). If something is broken, use the `troubleshoot` skill.

## What tests exist

Documenso has two categories of tests, run by two different tools.

### 1. Unit tests (Vitest)

- **Where:** `packages/lib/**/*.test.ts`, `packages/signing/**/*.test.ts`
- **Purpose:** fast, isolated checks of pure logic — no database, no network, no browser. Things like signing-order sorting, SSRF guards on webhook URLs, CSS sanitization, and PDF font-fallback selection.
- **Requires:** nothing beyond `npm install`. No Docker, no running app.

Examples: `packages/lib/utils/recipients.test.ts`, `packages/lib/server-only/webhooks/is-private-url.test.ts`, `packages/lib/constants/pdf.test.ts`.

> **Known gap:** these unit tests aren't currently wired into any CI workflow — they run locally/on-demand only, not automatically on every PR. Don't assume a green PR means they were run; run them yourself before pushing.

### 2. End-to-end tests (Playwright)

- **Where:** `packages/app-tests/e2e/**/*.spec.ts` (~120 spec files)
- **Purpose:** verify real behavior against a running instance of the app and a real database — API contracts, multi-step UI flows, auth, permissions, PDF rendering, etc.
- **Requires:** Docker services up, database migrated and seeded, and (for most runs) the app built and running.

Playwright groups specs into three projects:

| Project | What it covers | Notes |
|---|---|---|
| `api` | Public API (v1/v2) and internal tRPC routes — hits real endpoints, no browser | Runs with 10 workers |
| `ui` | Full browser flows — document/template creation, editor, teams, orgs, admin, auth, PDF viewer, visual regression | Worker count auto-scales to CPU cores |
| `license` | Enterprise/license-gated features | Forced to run serially (1 worker); not covered in this guide since it needs an enterprise license |

Examples: `packages/app-tests/e2e/api/v2/envelopes-api.spec.ts` (api), `packages/app-tests/e2e/user/auth-flow.spec.ts` (ui).

## How to run the tests

Run a single test first, widen the net later. Starting narrow gives you a fast feedback loop — if something's misconfigured (env, Docker, a bad seed), you find out in seconds against one test instead of minutes into a 1,000+ test run, and the failure is much easier to pin down.

### Unit tests

Start with one file:

```sh
cd packages/lib
npm run test -- utils/recipients.test.ts   # one file, runs once
npm run test:watch -- utils/recipients.test.ts   # same file, re-runs on save
```

This should take approx 0.3s

Once that's green, widen to the whole package:

```sh
npm run test         # every *.test.ts in packages/lib (vitest run)
npm run test:watch   # same, re-runs on any change
```

"npm run test" should take approx 1s

To see a test actually catch something, change a line in `packages/lib/utils/recipients.ts` (the logic behind `recipients.test.ts`) and re-run `npm run test -- utils/recipients.test.ts` — it should fail. Revert the change and re-run to confirm it's green again.

### End-to-end tests

Bring up dev services and seed the database (skip if already done):

```sh
npm run dx:up
npm run prisma:migrate-dev
npm run prisma:seed
```

> **Troubleshooting:** if any of these fail, run the `troubleshoot` skill (`/troubleshoot`) instead of debugging by hand — it checks Docker, ports, `.env`, and the database in one pass.

Start the app in its own terminal, from `apps/remix`, and leave it running:

```sh
cd apps/remix
npm run start
```

> **Troubleshooting:** don't use the root `npm run start` — it also starts `@documenso/docs`, which defaults to the same port 3000 as `@documenso/remix` and can crash one of them with `EADDRINUSE :::3000`. Running `apps/remix` directly avoids that. If port 3000 is still stuck from something else, find and stop it: `lsof -i :3000` then `kill <PID>`.
>
> **Troubleshooting:** running the same test repeatedly (e.g. signup/login flows) can trip the app's real rate limits — a request that should succeed comes back `429`, and the test hangs waiting on a navigation that never happens. Set `DANGEROUS_BYPASS_RATE_LIMITS=true` in `.env` before starting the app to disable rate limiting locally — this is what CI does too (`.github/workflows/e2e-tests.yml`). After changing `.env` restart the app.

Run a single spec file first, from `packages/app-tests`:

```sh
cd packages/app-tests
npm run test:dev -- e2e/user/auth-flow.spec.ts
```

Approx 6 seconds.

> **Troubleshooting:** `ECONNREFUSED ::1:3000` means the app from the previous step isn't up yet — go back and confirm it's serving on `localhost:3000`.

To watch the browser while a test runs, add `--headed`:

```sh
npm run test:dev -- --headed e2e/user/auth-flow.spec.ts
```

> **Troubleshooting:** Playwright's interactive UI mode (`npm run test-ui:dev`) can hang and time out on a test that passes fine both headless and headed — this has been observed even with trace and video both disabled, so it's specific to UI mode's own reporter, not your test or the app. 


Running with UI should be like this, but I get timeout

```sh
npm run test-ui:dev -- e2e/user/auth-flow.spec.ts
```

## Running many tests at once

These commands cover more ground than a single spec, so expect them to take minutes, not seconds — only reach for them once single specs are passing reliably.

Scope up to one whole test project:

```sh
npm run test:dev -- --project=api   # ~466 tests, no browser, ~1–3 min
```

Only run everything once you trust the setup:

```sh
npm run test:dev
```

> **Troubleshooting:** this runs all ~1,100 tests across all three projects (`api`, `ui`, `license`) and takes roughly **20–30 minutes**, dominated by the browser-driven `ui` project — expect it to be slow, and expect a failure to take longer to pin down than in a single spec.
