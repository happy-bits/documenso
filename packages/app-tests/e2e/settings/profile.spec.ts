import { prisma } from '@documenso/prisma';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';

import { apiSignin } from '../fixtures/authentication';

test.describe('Profile settings', () => {
  test('job title is optional, editable, and persists after reload', async ({ page }) => {
    const { user } = await seedUser();

    // A signature is required to submit the form — irrelevant to what this test covers.
    await prisma.user.update({ where: { id: user.id }, data: { signature: 'data:image/png;base64,seeded' } });

    await apiSignin({ page, email: user.email });
    await page.goto('/settings/profile');

    const jobTitleInput = page.getByLabel(/job title/i);

    // Optional — existing users have no job title set.
    await expect(jobTitleInput).toHaveValue('');

    await jobTitleInput.fill('Senior Software Engineer');
    await page.getByRole('button', { name: /update profile/i }).click();

    await expect(page.getByText('Profile updated').first()).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByLabel(/job title/i)).toHaveValue('Senior Software Engineer');
  });
});
