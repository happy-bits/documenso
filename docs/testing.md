# Testing Guide

This guide explains what tests exist in Documenso, why they exist, and how to run them. It ends with two hands-on walkthroughs: break a unit test, then break an end-to-end test, so you can see the safety net in action before you start changing real code.

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

### Unit tests

```sh
cd packages/lib
npm run test         # runs once (vitest run)
npm run test:watch   # re-runs on file changes
```

(`packages/signing` has its own `npm run test` the same way.)

### End-to-end tests

Make sure your dev services are up and the database is seeded (skip if already done):

```sh
npm run dx:up
npm run prisma:migrate-dev
npm run prisma:seed
```

Then, from `packages/app-tests`:

```sh
npm run test:dev       # run against an app you already have running (npm run dev)
npm run test-ui:dev    # same, but opens Playwright's interactive UI mode
npm run test:e2e       # builds and starts the app itself, then runs all specs — closest to CI
```

To run a single spec file instead of the whole suite, pass a path:

```sh
npm run test:dev -- e2e/user/auth-flow.spec.ts
```

## Walkthrough: break a unit test

This shows the value of the test — it should fail loudly the moment the logic it protects changes.

1. Run the recipients test suite and confirm it's green:

   ```sh
   cd packages/lib
   npm run test -- utils/recipients.test.ts
   ```

   You should see all tests in `recipients.test.ts` pass, including *"sorts CC recipients after ordered active recipients"*.

2. Open `packages/lib/utils/recipients.ts` and find `sortRecipientsForSigningOrder`:

   ```ts
   // CC recipients always sort after non-CC recipients.
   if (r1IsCcRecipient !== r2IsCcRecipient) {
     return r1IsCcRecipient ? 1 : -1;
   }
   ```

   Flip the ternary so CC recipients sort *before* everyone else instead of after:

   ```ts
   return r1IsCcRecipient ? -1 : 1;
   ```

3. Re-run the test:

   ```sh
   npm run test -- utils/recipients.test.ts
   ```

   `sorts CC recipients after ordered active recipients` now fails — the expected recipient order `[3, 2, 1]` no longer matches, because CC recipient `id: 1` sorts to the front instead of the back.

4. Revert the change in `recipients.ts` and re-run to confirm it's green again.

## Walkthrough: break an end-to-end test (API project)

1. Get the app running in one terminal:

   ```sh
   npm run dev
   ```

2. In another terminal, run the envelopes API spec:

   ```sh
   cd packages/app-tests
   npm run test:dev -- e2e/api/v2/envelopes-api.spec.ts
   ```

   Confirm `should create envelope with single file` passes.

3. Open `packages/trpc/server/envelope-router/create-envelope.ts` and find where each uploaded file becomes an envelope item:

   ```ts
   return {
     title: file.name,
     documentDataId: documentData.id,
     placeholders,
   };
   ```

   Change `title: file.name` to something that ignores the real filename, e.g. `title: 'renamed-file'`.

4. Re-run the spec:

   ```sh
   npm run test:dev -- e2e/api/v2/envelopes-api.spec.ts
   ```

   `should create envelope with single file` now fails on:

   ```
   expect(envelope?.envelopeItems[0].title).toBe('field-font-alignment.pdf')
   ```

   because the created envelope item is now titled `renamed-file` instead of the uploaded PDF's filename.

5. Revert the change in `create-envelope.ts`.

## Walkthrough: break an end-to-end test (UI project)

1. With the app running (`npm run dev`), open Playwright's UI mode for the auth flow spec:

   ```sh
   cd packages/app-tests
   npm run test-ui:dev -- e2e/user/auth-flow.spec.ts
   ```

   Run `[USER] can sign in using email and password` and confirm it passes — you can watch the browser steps in the UI mode timeline.

2. Open `apps/remix/app/components/forms/signin.tsx` and find the sign-in button label:

   ```tsx
   {isSubmitting ? <Trans>Signing in...</Trans> : <Trans>Sign In</Trans>}
   ```

   Change `Sign In` to `Log In`.

3. Re-run the same test in Playwright UI mode. It now fails on:

   ```ts
   await page.getByRole('button', { name: 'Sign In' }).click();
   ```

   Playwright times out looking for a button named "Sign In" — the UI mode view highlights the missing element and shows a screenshot of the actual page, where the button now reads "Log In".

4. Revert the label change in `signin.tsx`.
