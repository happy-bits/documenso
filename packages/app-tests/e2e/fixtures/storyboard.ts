import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';

import { createDatabaseSnapshotter, type DatabaseSnapshot } from './database';

/**
 * Captures a screenshot per guide step so a run can be rendered as an annotated
 * storyboard (`npm run test:e2e:storyboard`).
 *
 * Off unless `STORYBOARD=1`, because a normal run should not pay for the
 * screenshots — `capture` becomes a no-op and the spec reads the same either
 * way. The panel text is deliberately NOT written here: the generator pairs
 * each captured step with that step's wording taken from the guide itself, so
 * the page shows what the guide says next to what the app did. Duplicating the
 * guide's prose into the spec would defeat that.
 *
 * Each capture also carries a snapshot of the envelope's own database rows
 * (`setEnvelopeId` records which one), so the generator can show what the
 * step did to the system alongside what it did on screen. Snapshotting is
 * silently skipped before `setEnvelopeId` is called — the envelope does not
 * exist yet, so there is nothing to read.
 */

export const STORYBOARD_DIR = path.join(__dirname, '../../storyboard');

const isEnabled = process.env.STORYBOARD === '1';

export type StoryboardShot = {
  step: number;
  label: string;
  actor: string;
  file: string;
  db: DatabaseSnapshot | null;
};

export type Storyboard = {
  /**
   * Screenshots the page and records it against a guide step.
   *
   * `label` says what the test just did, in the test's own words — the guide's
   * wording is added later by the generator.
   *
   * `waitFor` is for panels whose subject renders after the assertion that
   * precedes them: the test is content to proceed once the editor's URL is
   * live, but a screenshot taken then shows an empty page and reads as a failed
   * upload. Only the storyboard run waits, so a normal run is unaffected.
   *
   * Several locators are awaited in order, which matters when the view is being
   * swapped: waiting for an element of the *new* view first guarantees the old
   * one is gone, so a subsequent wait cannot be satisfied by a leftover node
   * from the previous step.
   */
  capture: (options: {
    page: Page;
    step: number;
    label: string;
    actor?: string;
    waitFor?: Locator | Locator[];
  }) => Promise<void>;
  /** Records which envelope subsequent captures should snapshot the database for. */
  setEnvelopeId: (envelopeId: string) => void;
  save: (meta: { spec: string; guide: string }) => Promise<void>;
  enabled: boolean;
};

export const createStoryboard = (): Storyboard => {
  const shots: StoryboardShot[] = [];
  const db = isEnabled ? createDatabaseSnapshotter() : null;
  let envelopeId: string | null = null;

  if (isEnabled) {
    // Cleared per run so a storyboard never mixes shots from two runs, which
    // would quietly show a step that no longer happens.
    rmSync(STORYBOARD_DIR, { recursive: true, force: true });
    mkdirSync(STORYBOARD_DIR, { recursive: true });
  }

  return {
    enabled: isEnabled,

    setEnvelopeId: (id) => {
      envelopeId = id;
    },

    capture: async ({ page, step, label, actor = 'Sender', waitFor }) => {
      if (!isEnabled) {
        return;
      }

      for (const locator of [waitFor ?? []].flat()) {
        await locator.waitFor({ state: 'visible', timeout: 10_000 });
      }

      const file = `step-${String(step).padStart(2, '0')}.png`;

      await page.screenshot({ path: path.join(STORYBOARD_DIR, file) });

      const snapshot = envelopeId && db ? await db.snapshot(envelopeId) : null;

      shots.push({ step, label, actor, file, db: snapshot });
    },

    save: async (meta) => {
      if (!isEnabled) {
        return;
      }

      await db?.close();

      writeFileSync(
        path.join(STORYBOARD_DIR, 'storyboard.json'),
        `${JSON.stringify({ ...meta, capturedAt: new Date().toISOString(), shots }, null, 2)}\n`,
      );
    },
  };
};
