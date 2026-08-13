import { Client } from 'pg';

/**
 * Verifies the preconditions the suite depends on, so a misconfigured run fails
 * immediately with an actionable message instead of as a wall of confusing test
 * failures.
 *
 * This only *checks*; it does not provision. Playwright starts `webServer`
 * before `globalSetup`, so creating the database here would deadlock against
 * the /api/health probe. `npm run test:e2e` sequences the provisioning.
 */
const globalSetup = async () => {
  const databaseUrl = process.env.NEXT_PRIVATE_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('NEXT_PRIVATE_DATABASE_URL is not set. Is .env.test present?');
  }

  const port = new URL(databaseUrl).port;

  if (port === '54320') {
    throw new Error(
      'Refusing to run: NEXT_PRIVATE_DATABASE_URL points at the development database on port 54320.\n' +
        'The suite resets the database it connects to, which would destroy your development data.\n' +
        'The test stack runs on 54322 — check that .env.test is being loaded.',
    );
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Could not connect to the test database at ${databaseUrl}.\n` +
        'Start the stack with "npm run test:e2e:services", or just use "npm run test:e2e".\n' +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const email = process.env.E2E_TEST_USER_EMAIL;

    if (!email) {
      throw new Error('E2E_TEST_USER_EMAIL is not set. Is .env.test present?');
    }

    // The seed is this suite's fixture, so confirm it is actually there rather
    // than discovering it one failed assertion at a time.
    const { rows } = await client.query('SELECT 1 FROM "User" WHERE email = $1', [email.toLowerCase()]);

    if (rows.length === 0) {
      throw new Error(
        `The test database has no user "${email}", so it is not seeded as expected.\n` +
          'Reset it with "npm run db:template:reset", or just use "npm run test:e2e".',
      );
    }
  } finally {
    await client.end();
  }
};

export default globalSetup;
