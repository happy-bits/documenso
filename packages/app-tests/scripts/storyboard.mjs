#!/usr/bin/env node

/**
 * Renders the screenshots captured by a storyboard run into a single
 * self-contained HTML page.
 *
 * Each panel pairs a screenshot with the wording of that step taken from the
 * user guide, so the page shows what the guide *says* next to what the app
 * actually *did*. The guide text is read from the markdown at generation time
 * rather than copied into the spec — that is the whole point: when the guide
 * and the app disagree, the panel shows it.
 *
 * Steps the guide describes but the run never captured are listed too, so the
 * page cannot be mistaken for full coverage of the guide.
 *
 * Usage:
 *   npm run test:e2e:storyboard                      capture a run, then render
 *   node packages/app-tests/scripts/storyboard.mjs   re-render the last capture
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.join(import.meta.dirname, '../../..');
const STORYBOARD_DIR = path.join(import.meta.dirname, '../storyboard');
const OUTPUT = path.join(STORYBOARD_DIR, 'index.html');

const escapeHtml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/**
 * Renders the small subset of markdown the guide's steps actually use.
 */
const renderInline = (value) =>
  escapeHtml(value)
    .replaceAll(/`([^`]+)`/g, '<code>$1</code>')
    .replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');

/**
 * Pulls the numbered steps out of the guide.
 *
 * The guide's list is continuous across its sections and its items can run to
 * several lines, so an item ends only where the next number or a heading
 * begins. Indented children (the tip blockquote under step 2) are dropped:
 * they are asides, not instructions.
 */
const parseGuideSteps = (markdown) => {
  const steps = new Map();

  let current = null;

  for (const line of markdown.split('\n')) {
    const start = /^(\d+)\.\s+(.*)$/.exec(line);

    if (start) {
      current = { number: Number(start[1]), lines: [start[2]] };
      steps.set(current.number, current);
      continue;
    }

    if (/^#{1,6}\s/.test(line) || line.trim() === '') {
      current = null;
      continue;
    }

    // Continuation of the current item: indented, and not a blockquote aside.
    if (current && /^\s+/.test(line) && !line.trimStart().startsWith('>')) {
      current.lines.push(line.trim());
    }
  }

  return new Map([...steps].map(([number, step]) => [number, step.lines.join(' ')]));
};

const main = () => {
  const metaPath = path.join(STORYBOARD_DIR, 'storyboard.json');

  if (!existsSync(metaPath)) {
    console.error(
      'No storyboard to render.\n' +
        'Capture one first with "npm run test:e2e:storyboard", which runs the spec with STORYBOARD=1.',
    );
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const guideSteps = parseGuideSteps(readFileSync(path.join(ROOT, meta.guide), 'utf8'));

  const captured = new Set(meta.shots.map((shot) => shot.step));
  const missing = [...guideSteps.keys()].filter((step) => !captured.has(step)).sort((a, b) => a - b);

  const panels = meta.shots
    .sort((a, b) => a.step - b.step)
    .map((shot) => {
      const image = readFileSync(path.join(STORYBOARD_DIR, shot.file)).toString('base64');
      const guideText = guideSteps.get(shot.step);

      return `
      <figure class="panel">
        <div class="shot">
          <img src="data:image/png;base64,${image}" alt="Step ${shot.step}: ${escapeHtml(shot.label)}" loading="lazy" />
        </div>
        <figcaption>
          <p class="step"><span class="num">Step ${shot.step}</span><span class="actor">${escapeHtml(
            shot.actor,
          )}</span></p>
          <p class="label">${escapeHtml(shot.label)}</p>
          <blockquote>${
            guideText ? renderInline(guideText) : '<em>No step with this number in the guide.</em>'
          }</blockquote>
        </figcaption>
      </figure>`;
    })
    .join('\n');

  const html = `<title>Send and Sign — storyboard</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fbfbfa;
    --panel: #ffffff;
    --ink: #1a1a19;
    --muted: #6b6b66;
    --line: #e3e2df;
    --quote: #f4f3f0;
    --accent: #3d5a3d;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #161715;
      --panel: #1e201d;
      --ink: #ecebe7;
      --muted: #9a9992;
      --line: #33352f;
      --quote: #26282400;
      --accent: #a8c69f;
    }
  }
  :root[data-theme='dark'] {
    --bg: #161715;
    --panel: #1e201d;
    --ink: #ecebe7;
    --muted: #9a9992;
    --line: #33352f;
    --quote: #262824;
    --accent: #a8c69f;
  }
  :root[data-theme='light'] {
    --bg: #fbfbfa;
    --panel: #ffffff;
    --ink: #1a1a19;
    --muted: #6b6b66;
    --line: #e3e2df;
    --quote: #f4f3f0;
    --accent: #3d5a3d;
  }
  body {
    margin: 0;
    padding: 2.5rem 1.5rem 4rem;
    background: var(--bg);
    color: var(--ink);
    font: 16px/1.55 ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 0.4rem; letter-spacing: -0.01em; }
  .sub { color: var(--muted); margin: 0 0 0.35rem; font-size: 0.92rem; }
  .sub code { font-size: 0.86em; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--quote); padding: 0.1em 0.32em; border-radius: 4px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1.25rem;
    margin-top: 2rem;
  }
  .panel {
    margin: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .shot { background: var(--quote); border-bottom: 1px solid var(--line); }
  .shot img { display: block; width: 100%; height: auto; }
  figcaption { padding: 0.9rem 1rem 1.1rem; }
  .step { display: flex; align-items: center; gap: 0.55rem; margin: 0 0 0.3rem; }
  .num { font-weight: 650; font-size: 0.9rem; color: var(--accent); }
  .actor { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .label { margin: 0 0 0.7rem; font-size: 0.95rem; }
  blockquote {
    margin: 0;
    padding: 0.6rem 0.8rem;
    background: var(--quote);
    border-left: 2px solid var(--accent);
    border-radius: 0 6px 6px 0;
    color: var(--muted);
    font-size: 0.86rem;
  }
  .note { margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.88rem; }
  .note strong { color: var(--ink); }
  .note ul { margin: 0.6rem 0 0; padding-left: 1.1rem; }
  .note li { margin-bottom: 0.3rem; }
</style>

<main>
  <h1>Send and Sign — storyboard</h1>
  <p class="sub">Each panel is a screenshot from a real run of <code>${escapeHtml(
    path.basename(meta.spec),
  )}</code>, paired with the wording of that step in <code>${escapeHtml(path.basename(meta.guide))}</code>.</p>
  <p class="sub">Captured ${escapeHtml(meta.capturedAt)} · ${meta.shots.length} of ${guideSteps.size} guide steps.</p>

  <div class="grid">
${panels}
  </div>

  <div class="note">
    <strong>Steps with no panel: ${missing.join(', ')}.</strong>
    <ul>
      <li>1–3 set up the local stack, which <code>npm run test:e2e</code> does instead of the spec.</li>
      <li>4 is the sign-in, which the test performs over the auth API rather than the form; the step 5 panel shows the result.</li>
      <li>12–13 happen in Inbucket's own UI; the test reads the same message over its REST API.</li>
      <li>17 is a page refresh, shown by the step 18 panel.</li>
      <li>19–20 are outside the test's scope: inspecting the signed PDF, and checking the other seeded account.</li>
    </ul>
  </div>
</main>
`;

  writeFileSync(OUTPUT, html);

  const sizeMb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(1);

  console.log(`\nstoryboard: ${meta.shots.length} panels, ${sizeMb} MB`);
  console.log(`written to ${path.relative(ROOT, OUTPUT)}\n`);
};

main();
