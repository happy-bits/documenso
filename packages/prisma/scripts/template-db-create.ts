import { execSync } from 'node:child_process';
import path from 'node:path';

import { Client } from 'pg';

/**
 * Builds a seeded "template" database (migrations + seed data run once) that
 * `template-db-reset.ts` can then clone via `CREATE DATABASE ... TEMPLATE`.
 * Postgres does a filesystem-level copy for that, which is far faster than
 * running `prisma migrate reset` + seeding again for every e2e run.
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

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();

  console.log(`[TEMPLATE DB]: Dropping "${templateDbName}" if it exists`);

  await admin.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [templateDbName],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${templateDbName}"`);

  console.log(`[TEMPLATE DB]: Creating "${templateDbName}"`);
  await admin.query(`CREATE DATABASE "${templateDbName}"`);

  await admin.end();

  const templateUrl = new URL(databaseUrl);
  templateUrl.pathname = `/${templateDbName}`;

  const env = {
    ...process.env,
    NEXT_PRIVATE_DATABASE_URL: templateUrl.toString(),
    NEXT_PRIVATE_DIRECT_DATABASE_URL: templateUrl.toString(),
  };

  console.log(`[TEMPLATE DB]: Running migrations against "${templateDbName}"`);
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: 'inherit',
  });

  console.log(`[TEMPLATE DB]: Seeding "${templateDbName}"`);
  execSync('npx tsx ./seed-database.ts', {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: 'inherit',
  });

  console.log(`[TEMPLATE DB]: "${templateDbName}" is ready to use as a template`);
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
