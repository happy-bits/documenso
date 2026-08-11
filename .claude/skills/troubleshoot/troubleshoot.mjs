#!/usr/bin/env node
/**
 * Diagnostic script for local dev environment issues.
 *
 * Prints a single JSON object to stdout: { checks: [{ id, label, status, detail, fix }] }
 * status is one of "ok" | "warn" | "fail".
 * `fix` (when present) is a shell command that would resolve the problem — the
 * script never runs it, it only reports it so a caller can offer to run it.
 *
 * Usage: node .claude/skills/troubleshoot/troubleshoot.mjs
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const checks = [];

function record(id, label, status, detail, fix) {
  checks.push({ id, label, status, detail, fix: fix ?? null });
}

function sh(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
    return { ok: true, out: out.toString().trim() };
  } catch (err) {
    return { ok: false, out: '', err: (err.stdout?.toString() || '') + (err.stderr?.toString() || err.message) };
  }
}

function portOpen(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function loadEnv() {
  const env = {};
  for (const file of ['.env', '.env.local']) {
    const p = path.join(ROOT, file);
    if (!existsSync(p)) {
      continue;
    }
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) {
        continue;
      }
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

// --- Node / npm versions ---------------------------------------------------

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 22) {
    record('node-version', 'Node.js version', 'ok', `v${process.versions.node} (>= 22 required)`);
  } else {
    record('node-version', 'Node.js version', 'fail', `v${process.versions.node} — project requires Node >= 22`, null);
  }
}

function checkNpm() {
  const res = sh('npm --version');
  if (!res.ok) {
    record('npm-installed', 'npm installed', 'fail', 'npm command not found');
    return;
  }
  const [major, minor = 0] = res.out.split('.').map(Number);
  const okVersion = major > 11 || (major === 11 && minor >= 11);
  record('npm-version', 'npm version', okVersion ? 'ok' : 'warn', `v${res.out} (project expects >= 11.11.0)`);
}

// --- Docker -----------------------------------------------------------------

function checkDockerInstalled() {
  const res = sh('docker --version');
  record(
    'docker-installed',
    'Docker installed',
    res.ok ? 'ok' : 'fail',
    res.ok ? res.out : 'docker CLI not found on PATH',
  );
  return res.ok;
}

function checkDockerRunning() {
  const res = sh('docker info');
  record(
    'docker-running',
    'Docker daemon running',
    res.ok ? 'ok' : 'fail',
    res.ok
      ? 'Docker daemon is responding'
      : 'Docker CLI works but the daemon is unreachable — is Docker Desktop running?',
  );
  return res.ok;
}

const COMPOSE_FILE = 'docker/development/compose.yml';
const COMPOSE_SERVICES = ['database', 'inbucket', 'redis', 'minio', 'gotenberg'];

function checkContainers() {
  const res = sh(`docker compose -f ${COMPOSE_FILE} ps --format json`);
  if (!res.ok) {
    for (const service of COMPOSE_SERVICES) {
      record(
        `container-${service}`,
        `Container: ${service}`,
        'fail',
        'Could not query docker compose (is Docker running?)',
        `docker compose -f ${COMPOSE_FILE} up -d`,
      );
    }
    return;
  }

  const lines = res.out.split('\n').filter(Boolean);
  const running = new Map();
  for (const line of lines) {
    try {
      const svc = JSON.parse(line);
      running.set(svc.Service, svc);
    } catch {
      // ignore malformed lines
    }
  }

  for (const service of COMPOSE_SERVICES) {
    const svc = running.get(service);
    if (!svc) {
      record(
        `container-${service}`,
        `Container: ${service}`,
        'fail',
        'not running',
        `docker compose -f ${COMPOSE_FILE} up -d ${service}`,
      );
      continue;
    }
    const state = (svc.State || '').toLowerCase();
    const health = (svc.Health || '').toLowerCase();
    if (state !== 'running') {
      record(
        `container-${service}`,
        `Container: ${service}`,
        'fail',
        `state=${state || 'unknown'}`,
        `docker compose -f ${COMPOSE_FILE} up -d ${service}`,
      );
    } else if (service === 'database') {
      // The database healthcheck (`pg_isready -U ${POSTGRES_USER}`) relies on compose-file
      // variable substitution that isn't populated from the repo's .env, so it always reports
      // unhealthy even when Postgres is fine. Real connectivity is verified separately by
      // checkDatabaseReachable(), so ignore the Docker health field for this service.
      record(`container-${service}`, `Container: ${service}`, 'ok', 'running');
    } else if (health && health !== 'healthy' && health !== '') {
      record(
        `container-${service}`,
        `Container: ${service}`,
        'warn',
        `running but health=${health}`,
        `docker compose -f ${COMPOSE_FILE} restart ${service}`,
      );
    } else {
      record(`container-${service}`, `Container: ${service}`, 'ok', 'running');
    }
  }
}

// --- Ports --------------------------------------------------------------

const EXPECTED_PORTS = [
  { port: 3000, label: 'App server (remix)', expectOpen: false },
  { port: 54320, label: 'Postgres', expectOpen: true },
  { port: 9000, label: 'Inbucket (mail UI)', expectOpen: true },
  { port: 63790, label: 'Redis', expectOpen: true },
  { port: 9001, label: 'MinIO console', expectOpen: true },
  { port: 9002, label: 'MinIO API', expectOpen: true },
  { port: 3005, label: 'Gotenberg', expectOpen: true },
];

async function checkPorts() {
  for (const { port, label, expectOpen } of EXPECTED_PORTS) {
    const open = await portOpen(port);
    if (expectOpen) {
      record(
        `port-${port}`,
        `Port ${port} (${label})`,
        open ? 'ok' : 'fail',
        open ? 'reachable' : 'not reachable — service container likely not running',
      );
    } else {
      // App port: we just want to know if something is already bound there.
      record(
        `port-${port}`,
        `Port ${port} (${label})`,
        open ? 'warn' : 'ok',
        open ? 'already in use — something is already listening here' : 'free',
      );
    }
  }
}

// --- Env file ---------------------------------------------------------------

function checkEnvFile(env) {
  const hasEnv = existsSync(path.join(ROOT, '.env'));
  record(
    'env-file',
    '.env file present',
    hasEnv ? 'ok' : 'fail',
    hasEnv ? '.env found' : '.env is missing — copy .env.example to .env',
    hasEnv ? null : 'cp .env.example .env',
  );

  const dbUrl = env.NEXT_PRIVATE_DATABASE_URL;
  record(
    'env-database-url',
    'NEXT_PRIVATE_DATABASE_URL set',
    dbUrl ? 'ok' : 'fail',
    dbUrl ? dbUrl.replace(/:[^:@/]+@/, ':****@') : 'not set in .env',
  );
}

// --- Database ---------------------------------------------------------------

function checkDatabaseReachable() {
  const res = sh('docker exec database pg_isready -U documenso');
  record(
    'database-reachable',
    'Database accepting connections',
    res.ok ? 'ok' : 'fail',
    res.ok ? res.out : 'Postgres container is not accepting connections',
    res.ok ? null : `docker compose -f ${COMPOSE_FILE} up -d database`,
  );
  return res.ok;
}

function checkMigrations(env) {
  const res = sh('npx prisma migrate status', {
    cwd: path.join(ROOT, 'packages/prisma'),
    env: { ...process.env, ...env },
  });
  const output = res.out || res.err || '';
  if (/Database schema is up to date/i.test(output)) {
    record('migrations', 'Database migrations', 'ok', 'schema is up to date');
  } else if (/have not yet been applied/i.test(output) || /following migration/i.test(output)) {
    record('migrations', 'Database migrations', 'fail', 'pending migrations found', 'npm run prisma:migrate-dev');
  } else if (!res.ok) {
    record(
      'migrations',
      'Database migrations',
      'fail',
      'could not determine migration status (is the database reachable?)',
      'npm run prisma:migrate-dev',
    );
  } else {
    record(
      'migrations',
      'Database migrations',
      'warn',
      output.split('\n').slice(-3).join(' ').trim() || 'unknown status',
    );
  }
}

function checkSeed() {
  const res = sh(
    `docker exec database psql -U documenso -d documenso -tAc "SELECT count(*) FROM \\"User\\" WHERE 'ADMIN' = ANY(\\"roles\\")"`,
  );
  if (!res.ok) {
    record(
      'seed-data',
      'Seed data (superadmin user)',
      'fail',
      'could not query the database — is it migrated and reachable?',
      'npm run prisma:seed',
    );
    return;
  }
  const count = Number(res.out.trim());
  if (Number.isFinite(count) && count > 0) {
    record('seed-data', 'Seed data (superadmin user)', 'ok', `${count} admin user(s) found`);
  } else {
    record(
      'seed-data',
      'Seed data (superadmin user)',
      'fail',
      'no admin user found — database has not been seeded',
      'npm run prisma:seed',
    );
  }
}

// --- Main --------------------------------------------------------------

async function main() {
  checkNode();
  checkNpm();

  const dockerInstalled = checkDockerInstalled();
  const dockerRunning = dockerInstalled && checkDockerRunning();

  if (dockerRunning) {
    checkContainers();
  } else {
    for (const service of COMPOSE_SERVICES) {
      record(`container-${service}`, `Container: ${service}`, 'fail', 'skipped — Docker is not available');
    }
  }

  await checkPorts();

  const env = loadEnv();
  checkEnvFile(env);

  if (dockerRunning) {
    const dbUp = checkDatabaseReachable();
    if (dbUp) {
      checkMigrations(env);
      checkSeed();
    } else {
      record('migrations', 'Database migrations', 'fail', 'skipped — database not reachable');
      record('seed-data', 'Seed data (superadmin user)', 'fail', 'skipped — database not reachable');
    }
  } else {
    record('database-reachable', 'Database accepting connections', 'fail', 'skipped — Docker is not available');
    record('migrations', 'Database migrations', 'fail', 'skipped — Docker is not available');
    record('seed-data', 'Seed data (superadmin user)', 'fail', 'skipped — Docker is not available');
  }

  process.stdout.write(JSON.stringify({ checks }, null, 2) + '\n');
}

main();
