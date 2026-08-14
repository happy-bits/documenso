#!/usr/bin/env node

/**
 * Runs the e2e pipeline phase by phase and prints a timeline of how long each
 * phase actually took.
 *
 * This is the same sequence `npm run test:e2e` runs, just wrapped so each phase
 * is timed and labelled. Output from the phases is passed straight through, so
 * this can replace `npm run test:e2e` rather than being an extra step.
 *
 * The interesting number is usually "warm up": the gap between Playwright
 * starting and the first test executing, which is the production server booting
 * plus the /api/health poll plus globalSetup. Nothing else in the pipeline
 * reports it.
 *
 * Usage:
 *   npm run test:e2e:timeline
 *   npm run test:e2e:timeline -- --skip-build         reuse the existing build
 *   npm run test:e2e:timeline -- --grep send-and-sign only matching specs
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.join(import.meta.dirname, '../../..');

const BAR_WIDTH = 44;

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const grepIndex = args.indexOf('--grep');
const grep = grepIndex === -1 ? null : args[grepIndex + 1];

const PHASES = [
  { key: 'services', label: 'docker services', script: 'test:e2e:services' },
  { key: 'db', label: 'database reset', script: 'test:e2e:db' },
  ...(skipBuild ? [] : [{ key: 'build', label: 'app build', script: 'test:e2e:build' }]),
  { key: 'run', label: 'playwright', script: 'test:e2e:run', args: grep ? ['--', grep] : [] },
];

// Playwright's list reporter is the only signal for where the run phase splits.
// "Running N tests" is printed after webServer is ready and globalSetup has
// returned, so it marks the boundary between warm-up and the specs themselves.
const RUNNING_TESTS = /Running \d+ tests? using \d+ worker/;
const TEST_RESULT = /^\s*[✓✘×]\s+\d+\s+(?:\[.*?\]\s+›\s+)?(.*?)\s+\((\d+(?:\.\d+)?)(m?s)\)\s*$/;

// Playwright colours its reporter output, so the markers above only match once
// the SGR escapes are gone. The pattern is assembled rather than written as a
// regex literal because an ESC is a control character there, which the linter
// rejects — including when it is written as an escape sequence.
const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g');

const stripAnsi = (value) => value.replaceAll(ANSI_SGR, '');

const formatDuration = (ms) => (ms >= 10_000 ? `${(ms / 1000).toFixed(0)}s` : `${(ms / 1000).toFixed(1)}s`);

/**
 * Runs one phase, passing its output through unchanged while watching for the
 * markers that split the Playwright phase into warm-up and specs.
 */
const runPhase = (phase) =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const marks = [];
    const tests = [];

    const child = spawn('npm', ['run', phase.script, ...(phase.args ?? [])], {
      cwd: ROOT,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let buffered = '';

    const consume = (chunk, target) => {
      target.write(chunk);

      buffered += chunk.toString();

      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = stripAnsi(rawLine);

        if (RUNNING_TESTS.test(line)) {
          marks.push({ key: 'firstTest', at: Date.now() });
          continue;
        }

        const result = TEST_RESULT.exec(line);

        if (result) {
          const [, name, value, unit] = result;

          tests.push({
            name: name.replace(/^.*›\s*/, '').trim(),
            ms: unit === 'ms' ? Number(value) : Number(value) * 1000,
            passed: rawLine.includes('✓'),
          });
        }
      }
    };

    child.stdout.on('data', (chunk) => consume(chunk, process.stdout));
    child.stderr.on('data', (chunk) => consume(chunk, process.stderr));

    child.on('close', (code) => {
      resolve({
        ...phase,
        startedAt,
        endedAt: Date.now(),
        exitCode: code ?? 0,
        marks,
        tests,
      });
    });
  });

/**
 * Splits the recorded phases into the segments worth showing. The Playwright
 * phase becomes two: everything before the first test (warm-up) and the tests.
 */
const toSegments = (results) => {
  const segments = [];

  for (const result of results) {
    const firstTest = result.marks.find((mark) => mark.key === 'firstTest');

    if (!firstTest) {
      segments.push({
        label: result.label,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        note: result.exitCode === 0 ? '' : `exit ${result.exitCode}`,
      });
      continue;
    }

    segments.push({
      label: 'warm up',
      startedAt: result.startedAt,
      endedAt: firstTest.at,
      note: 'server boot + /api/health + globalSetup',
    });

    segments.push({
      label: 'specs',
      startedAt: firstTest.at,
      endedAt: result.endedAt,
      note: `${result.tests.length} test${result.tests.length === 1 ? '' : 's'}${
        result.exitCode === 0 ? '' : ', failed'
      }`,
    });
  }

  return segments;
};

const render = (segments, tests) => {
  const first = segments[0].startedAt;
  const last = segments.at(-1).endedAt;
  const total = Math.max(last - first, 1);

  const labelWidth = Math.max(...segments.map((segment) => segment.label.length), 8);

  const lines = ['', 'e2e pipeline timeline', `total ${formatDuration(total)}`, ''];

  for (const segment of segments) {
    const duration = segment.endedAt - segment.startedAt;
    const offset = Math.floor(((segment.startedAt - first) / total) * BAR_WIDTH);
    // Always at least one cell, so a fast phase is visible rather than absent.
    const width = Math.max(Math.round((duration / total) * BAR_WIDTH), 1);
    const bar = `${' '.repeat(offset)}${'█'.repeat(Math.min(width, BAR_WIDTH - offset))}`;

    lines.push(
      `  ${segment.label.padEnd(labelWidth)}  ${bar.padEnd(BAR_WIDTH)}  ${formatDuration(duration).padStart(6)}  ${
        segment.note
      }`,
    );
  }

  if (tests.length > 0) {
    lines.push('', '  per test');

    for (const test of tests) {
      lines.push(`  ${test.passed ? '✓' : '✘'} ${formatDuration(test.ms).padStart(6)}  ${test.name}`);
    }
  }

  lines.push('');

  return lines.join('\n');
};

const main = async () => {
  const results = [];

  for (const phase of PHASES) {
    const result = await runPhase(phase);

    results.push(result);

    // Keep going after a failing test run so the timeline is still printed —
    // a slow or hanging phase is exactly when this output is most useful — but
    // stop if the environment itself could not be prepared.
    if (result.exitCode !== 0 && result.key !== 'run') {
      break;
    }
  }

  const segments = toSegments(results);
  const tests = results.flatMap((result) => result.tests);

  const report = render(segments, tests);

  console.log(report);

  const outputDir = path.join(import.meta.dirname, '../test-results');

  mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'timeline.json');

  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        totalMs: segments.at(-1).endedAt - segments[0].startedAt,
        segments: segments.map((segment) => ({
          label: segment.label,
          ms: segment.endedAt - segment.startedAt,
          note: segment.note,
        })),
        tests,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`  written to ${path.relative(ROOT, outputPath)}\n`);

  process.exit(results.at(-1)?.exitCode ?? 0);
};

await main();
