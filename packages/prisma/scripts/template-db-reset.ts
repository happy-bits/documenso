import { execSync } from 'node:child_process';
import path from 'node:path';

import { Client } from 'pg';

/**
 * Fast e2e reset: drops the working database and recreates it from the
 * pre-seeded template built by `template-db-create.ts`. This is a
 * filesystem-level copy in Postgres, so it skips re-running migrations and
 * the (bcrypt-heavy) seed script on every test run.
 *
 * Builds the template first if it is missing, so this is safe to run against a
 * brand new Postgres instance — the e2e stack keeps its data in tmpfs, so every
 * fresh `docker compose up` starts without one.
 */
const run = async () => {
  const databaseUrl = process.env.NEXT_PRIVATE_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('NEXT_PRIVATE_DATABASE_URL is not set');
  }

  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, '');
  const templateDbName = `${dbName}_template`;

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';

  const connectAdmin = async () => {
    const client = new Client({ connectionString: adminUrl.toString() });
    await client.connect();
    return client;
  };

  const probe = await connectAdmin();

  const { rows } = await probe.query('SELECT 1 FROM pg_database WHERE datname = $1', [templateDbName]);

  // Release the connection before delegating: template-db-create.ts runs its
  // own DROP/CREATE DATABASE and a `pg` client cannot be reconnected once
  // ended, so the post-create work below uses a fresh one.
  await probe.end();

  if (rows.length === 0) {
    console.log(`[TEMPLATE DB]: "${templateDbName}" does not exist yet, building it`);

    execSync('npx tsx ./scripts/template-db-create.ts', {
      cwd: path.join(__dirname, '..'),
      env: process.env,
      stdio: 'inherit',
    });
  }

  const admin = await connectAdmin();

  console.log(`[TEMPLATE DB]: Terminating connections to "${dbName}"`);
  await admin.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [dbName],
  );

  console.log(`[TEMPLATE DB]: Dropping "${dbName}"`);
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);

  console.log(`[TEMPLATE DB]: Recreating "${dbName}" from template "${templateDbName}"`);
  await admin.query(`CREATE DATABASE "${dbName}" TEMPLATE "${templateDbName}"`);

  await admin.end();

  console.log(`[TEMPLATE DB]: "${dbName}" reset from template`);
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
