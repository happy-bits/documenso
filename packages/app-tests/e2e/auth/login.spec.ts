import { expect, test } from '@playwright/test';

import { getSession, TEST_USER, uiSignin } from '../fixtures/authentication';

test('a seeded user can sign in with email and password', async ({ page }) => {
  await uiSignin({ page });

  const session = await getSession(page);

  expect(session.isAuthenticated).toBe(true);
  expect(session.user.email).toBe(TEST_USER.email);
});
