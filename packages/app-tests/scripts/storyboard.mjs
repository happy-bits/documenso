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
 * Each panel also renders the envelope's database rows as of that step,
 * alongside the screenshot, with cells that changed since the *previous*
 * captured step highlighted — so the page shows what the guide's action did
 * to the system, not just to the screen. Steps before the envelope exists (the
 * initial sign-in) have no data to show.
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

/**
 * Wraps a rendered cell in a `changed` marker when `wasChanged` is true. The
 * generator decides *what* counts as changed per table below; this just
 * applies the visual treatment consistently.
 */
const cell = (value, wasChanged) => `<td class="${wasChanged ? 'changed' : ''}">${escapeHtml(String(value))}</td>`;

/**
 * Diffs one snapshot's rows against the previous captured step's, by row
 * index rather than identity — each table (recipients, fields) is created
 * once up front and only ever updated in place, so index alignment holds for
 * the whole run.
 */
const renderDbPanel = (snapshot, previous) => {
  if (!snapshot?.envelope) {
    return '<p class="db-empty">No envelope yet.</p>';
  }

  const prevEnvelope = previous?.envelope ?? null;

  const envelopeRow = `
    <table class="db-table">
      <tr>${cell('status', false)}${cell('completed', false)}</tr>
      <tr>${cell(snapshot.envelope.status, snapshot.envelope.status !== prevEnvelope?.status)}${cell(
        snapshot.envelope.completedAt,
        snapshot.envelope.completedAt !== (prevEnvelope?.completedAt ?? false),
      )}</tr>
    </table>`;

  const recipientRows = snapshot.recipients
    .map((recipient, index) => {
      const prev = previous?.recipients?.[index];

      return `<tr>
        ${cell(recipient.name, false)}
        ${cell(recipient.role, prev && recipient.role !== prev.role)}
        ${cell(recipient.sendStatus, prev && recipient.sendStatus !== prev.sendStatus)}
        ${cell(recipient.signingStatus, prev && recipient.signingStatus !== prev.signingStatus)}
        ${cell(recipient.readStatus, prev && recipient.readStatus !== prev.readStatus)}
        ${cell(recipient.signedAt, prev && recipient.signedAt !== prev.signedAt)}
      </tr>`;
    })
    .join('\n');

  const fieldRows = snapshot.fields
    .map((field, index) => {
      const prev = previous?.fields?.[index];

      return `<tr>
        ${cell(field.type, !prev)}
        ${cell(field.recipient, false)}
        ${cell(field.page, false)}
        ${cell(field.inserted, prev && field.inserted !== prev.inserted)}
      </tr>`;
    })
    .join('\n');

  const signatureRows = snapshot.signatures
    .map((signature, index) => {
      const isNew = !previous?.signatures?.[index];

      return `<tr>${cell(signature.recipient, isNew)}${cell(signature.method, isNew)}</tr>`;
    })
    .join('\n');

  // The audit log only ever grows, in order, so anything past the previous
  // snapshot's length is new — no need to diff row by row.
  const newAuditLogCount = snapshot.auditLog.length - (previous?.auditLog?.length ?? 0);

  return `
    <div class="db">
      <p class="db-heading">Envelope</p>
      ${envelopeRow}
      ${
        recipientRows
          ? `<p class="db-heading">Recipients</p>
      <table class="db-table">
        <tr><th>Name</th><th>Role</th><th>Send</th><th>Signing</th><th>Read</th><th>Signed</th></tr>
        ${recipientRows}
      </table>`
          : ''
      }
      ${
        fieldRows
          ? `<p class="db-heading">Fields</p>
      <table class="db-table">
        <tr><th>Type</th><th>Recipient</th><th>Page</th><th>Inserted</th></tr>
        ${fieldRows}
      </table>`
          : ''
      }
      ${
        signatureRows
          ? `<p class="db-heading">Signatures</p>
      <table class="db-table">
        <tr><th>Recipient</th><th>Method</th></tr>
        ${signatureRows}
      </table>`
          : ''
      }
      <p class="db-heading">Audit log <span class="db-count">${snapshot.auditLog.length} row${
        snapshot.auditLog.length === 1 ? '' : 's'
      }${newAuditLogCount > 0 ? `, +${newAuditLogCount} this step` : ''}</span></p>
    </div>`;
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

  const sortedShots = meta.shots.sort((a, b) => a.step - b.step);

  const panels = sortedShots
    .map((shot, index) => {
      const image = readFileSync(path.join(STORYBOARD_DIR, shot.file)).toString('base64');
      const guideText = guideSteps.get(shot.step);
      const previous = index > 0 ? sortedShots[index - 1].db : null;

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
          <details class="db-details">
            <summary>Database</summary>
            ${renderDbPanel(shot.db ?? null, previous)}
          </details>
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
    grid-template-columns: 1fr;
    max-width: 860px;
    margin: 2rem auto 0;
    gap: 1.5rem;
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

  .db-details { margin-top: 0.7rem; }
  .db-details summary { cursor: pointer; font-size: 0.8rem; color: var(--muted); }
  .db-empty { color: var(--muted); font-size: 0.82rem; margin: 0.5rem 0 0; }
  .db { margin-top: 0.5rem; max-width: 100%; overflow-x: auto; }
  .db-heading { margin: 0.7rem 0 0.3rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .db-count { text-transform: none; letter-spacing: 0; }
  .db-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .db-table th, .db-table td { text-align: left; padding: 0.25rem 0.4rem; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .db-table th { color: var(--muted); font-weight: 500; }
  .db-table td.changed { background: color-mix(in srgb, var(--accent) 22%, transparent); border-radius: 3px; font-weight: 600; }
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
