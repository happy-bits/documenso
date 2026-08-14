import { expect, type Page } from '@playwright/test';

/**
 * The account created by `packages/prisma/seed/initial-seed.ts`, configured in
 * `.env.test`.
 */
export const TEST_USER = {
  email: process.env.E2E_TEST_USER_EMAIL ?? 'example@documenso.com',
  password: process.env.E2E_TEST_USER_PASSWORD ?? 'password',
};

/**
 * The admin account created by `packages/prisma/seed/initial-seed.ts`. It owns
 * no seeded documents, so a test that creates one starts from an empty list.
 */
export const ADMIN_USER = {
  email: process.env.E2E_ADMIN_USER_EMAIL ?? 'admin@documenso.com',
  password: process.env.E2E_ADMIN_USER_PASSWORD ?? 'password',
};

/**
 * Signs in through the sign-in form, the way a user would.
 *
 * Prefer `apiSignin` for tests that merely need to *be* authenticated — this
 * one exercises the form itself and is correspondingly slower.
 */
export const uiSignin = async ({
  page,
  email = TEST_USER.email,
  password = TEST_USER.password,
}: {
  page: Page;
  email?: string;
  password?: string;
}) => {
  await page.goto('/signin');

  // `exact` matters on the password field: the reveal toggle next to it is
  // labelled "Reveal password", which a substring match also picks up.
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page).not.toHaveURL(/\/signin/);
};

/**
 * Signs in over the API, skipping the form.
 */
export const apiSignin = async ({
  page,
  email = TEST_USER.email,
  password = TEST_USER.password,
  redirectPath = '/',
}: {
  page: Page;
  email?: string;
  password?: string;
  redirectPath?: string;
}) => {
  const { request } = page.context();

  const csrfToken = await getCsrfToken(page);

  const response = await request.post('/api/auth/email-password/authorize', {
    data: { email, password, csrfToken },
  });

  if (!response.ok()) {
    throw new Error(`Sign in failed for ${email}: ${response.status()} ${await response.text()}`);
  }

  await page.goto(redirectPath);
};

export const apiSignout = async ({ page }: { page: Page }) => {
  const { request } = page.context();

  await request.post('/api/auth/signout');

  await page.goto('/signin');
};

/**
 * Asks the server whether the current browser context holds a valid session,
 * rather than inferring it from the URL.
 */
export const getSession = async (page: Page) => {
  const response = await page.request.get('/api/auth/session');

  if (!response.ok()) {
    throw new Error(`Could not read session: ${response.status()}`);
  }

  return response.json();
};

const getCsrfToken = async (page: Page) => {
  const { request } = page.context();

  const response = await request.get('/api/auth/csrf');

  const { csrfToken } = await response.json();

  if (!csrfToken) {
    throw new Error('Could not obtain a CSRF token');
  }

  return csrfToken;
};
