import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// NOTE ON THE PLAYWRIGHT VERSION
//
// `@playwright/test` here is intentionally NEWER than the `playwright` pinned by
// `packages/lib` (1.56.1, a production dependency used for PDF generation). Do
// not "align" them back to 1.56.1: on 1.56.1, saving a trace with DOM snapshots
// hangs on any page this app serves, so every test sat until its timeout. That
// broke `--ui` completely (UI mode forces `trace: { mode: 'on', ... }`) and
// silently broke `trace: 'retain-on-failure'` — a failing test would take an
// extra 60s and report a spurious timeout on top of the real error.
//
// The two versions coexist fine; they are separate packages with separate
// browser downloads.
const ROOT = path.join(__dirname, '../..');

// Mirrors `dotenv -e .env.test -e .env`: dotenv never overwrites a key that is
// already set, so the first file to define a key wins. Anything already in the
// real environment (CI secrets, an explicit override on the command line) wins
// over both.
for (const file of ['.env.test', '.env']) {
  dotenv.config({ path: path.join(ROOT, file), quiet: true });
}

const PORT = process.env.PORT || '3001';
const BASE_URL = process.env.NEXT_PUBLIC_WEBAPP_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',

  // The suite runs strictly one test at a time.
  //
  // The app under test is a single server process backed by a single database,
  // and the database is reset to a known state once per run rather than per
  // test (the reset drops and re-clones the database, which cannot happen
  // underneath live connections). Serial execution is what makes a test's
  // starting state knowable.
  fullyParallel: false,
  workers: 1,

  // No retries. A retry hides exactly the non-determinism this setup exists to
  // remove; a test that only passes on attempt two is a failing test.
  retries: 0,

  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['html'], ['list']] : [['list']],
  timeout: 60_000,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    contextOptions: {
      reducedMotion: 'reduce',
    },
  },

  // Asserts the database is reachable and holds the expected seed data before
  // any test runs. Note this cannot be where the stack is *provisioned*:
  // Playwright starts `webServer` before `globalSetup`, so a globalSetup that
  // created the database would deadlock against a health probe waiting for it.
  // Provisioning is sequenced by `npm run test:e2e` instead.
  globalSetup: './global-setup.ts',

  projects: [
    {
      name: 'e2e',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1200 },
      },
    },
  ],

  webServer: {
    // The production server, not the dev server: it is what CI runs and it
    // removes dev-only recompilation from the timing of every test. Requires a
    // build first, which `npm run test:e2e` handles.
    command: 'npm run start:test -w @documenso/remix',
    cwd: ROOT,
    // Readiness is gated on /api/health, which runs `SELECT 1` against
    // Postgres and returns 500 if that fails. Polling it means "ready" implies
    // both the webserver and the database are actually usable — unlike polling
    // `/`, which only proves Node is listening.
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
