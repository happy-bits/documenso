import { Client } from 'pg';

/**
 * Fast e2e reset: drops the working database and recreates it from the
 * pre-seeded template built by `template-db-create.ts`. This is a
 * filesystem-level copy in Postgres, so it skips re-running migrations and
 * the (bcrypt-heavy) seed script on every test run.
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

  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [templateDbName]);

  if (rows.length === 0) {
    await admin.end();
    throw new Error(`Template database "${templateDbName}" does not exist. Run "npm run db:template:create" first.`);
  }

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
