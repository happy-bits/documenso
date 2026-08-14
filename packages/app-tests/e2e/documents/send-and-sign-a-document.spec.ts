import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import { ADMIN_USER, apiSignin } from '../fixtures/authentication';
import { clearMailbox, extractSigningUrl, waitForEmail } from '../fixtures/mail';
import { createStoryboard } from '../fixtures/storyboard';

/**
 * Covers `docs/user/guides/send-and-sign-a-document.md`: upload a PDF, add a
 * recipient and a signature field, send it, sign it as the recipient, and see
 * the document turn Completed.
 *
 * The guide is the source of the scenario, not a contract: where the documented
 * UI gesture is unreliable to drive (HTML5 drag-and-drop, freehand signature
 * drawing) this takes the equivalent supported path instead, noted at each site.
 *
 * Comments below cite the guide's step numbers, which are continuous across its
 * sections. Steps 1-3 (start the stack, reset the database, open the app) are
 * handled by `npm run test:e2e`, not here. Steps 19-20 (inspect the signed PDF,
 * confirm the other seeded account is untouched) are deliberately out of scope.
 */

const RECIPIENT = {
  name: 'Jane Recipient',
  email: 'jane.recipient@documenso.com',
  mailbox: 'jane.recipient',
};

const INVITE_SUBJECT = 'invited you to sign a document';

const EXAMPLE_PDF = path.join(__dirname, '../../../../assets/example.pdf');

// Every wait is bounded well below the 60s test timeout: a step that needs
// longer than this is broken, not slow, and should say so immediately.
const STEP_TIMEOUT = 10_000;

const log = (message: string) => console.log(`[send-and-sign] ${message}`);

test('a document can be uploaded, sent, signed by the recipient, and completed', async ({ page, request }) => {
  const title = `E2E Send And Sign ${Date.now()}`;

  // No-op unless STORYBOARD=1; see the fixture.
  const storyboard = createStoryboard();

  // Inbucket lives in the container and outlives the per-run database reset, so
  // yesterday's invite must not be able to satisfy today's assertion.
  await clearMailbox({ request, mailbox: RECIPIENT.mailbox });

  // Steps 4-5: log in as admin, then reach the Documents page. Signing in over
  // the API rather than the form; the form itself is covered by `auth/login`.
  log(`signing in as ${ADMIN_USER.email}`);
  await apiSignin({ page, email: ADMIN_USER.email, password: ADMIN_USER.password, redirectPath: '/documents' });
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible({ timeout: STEP_TIMEOUT });
  await storyboard.capture({ page, step: 5, label: 'the Documents list, signed in as admin' });

  // Step 6: drop a PDF onto the page. Playwright cannot synthesise a real HTML5
  // file drag, so this drives the dropzone's own file input instead — the same
  // handler the drop event ends up calling.
  log('uploading example.pdf');
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'example.pdf',
      mimeType: 'application/pdf',
      buffer: fs.readFileSync(EXAMPLE_PDF),
    });

  await page.waitForURL(/\/documents\/([^/]+)\/edit/, { timeout: STEP_TIMEOUT });
  log(`editor opened at ${page.url()}`);

  const envelopeId = /\/documents\/([^/]+)\/edit/.exec(page.url())?.[1];

  if (!envelopeId) {
    throw new Error(`Could not extract an envelope id from ${page.url()}`);
  }

  storyboard.setEnvelopeId(envelopeId);

  // Not in the guide: give the document a known title so it can be found in the
  // list later, independent of how many other documents the account has.
  await page.getByTestId('envelope-title-input').fill(title);
  await storyboard.capture({
    page,
    step: 6,
    label: 'example.pdf uploaded and listed in the editor',
    // The upload page lists the envelope's items; the row appearing is what
    // shows the upload registered, rather than an empty dropzone.
    waitFor: page.locator('[data-testid^="envelope-item-row-"]').first(),
  });

  // Step 7: on Document & Recipients, add Jane as a Signer (the default role,
  // so it is left alone), then move to Add Fields.
  log('adding recipient');
  await page.getByTestId('signer-email-input').first().fill(RECIPIENT.email);
  await page.locator('input[placeholder^="Recipient "]').first().fill(RECIPIENT.name);
  await storyboard.capture({ page, step: 7, label: 'Jane Recipient added as a Signer' });

  // Step 8: select Jane and place a Signature field. The guide describes a drag
  // from the field palette; the editor also supports click-the-field then
  // click-the-page, which is the same code path without the drag.
  log('placing signature field');
  await page.getByTestId('envelope-editor-step-addFields').first().click();

  await page.locator('button[role="combobox"]').first().click();
  await page.getByText(RECIPIENT.email).first().click();

  await page.getByRole('button', { name: 'Signature', exact: true }).click();

  const canvas = page.locator('.konva-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: STEP_TIMEOUT });
  await canvas.click({ position: { x: 200, y: 200 } });
  await storyboard.capture({ page, step: 8, label: 'a Signature field placed on the page' });

  // Step 9: open Preview. The guide's eyeball check of the document and
  // recipient has no automated equivalent, so this only navigates.
  log('opening send dialog');
  await page.getByTestId('envelope-editor-step-preview').first().click();
  await storyboard.capture({
    page,
    step: 9,
    label: 'the Preview step',
    // The alert first: it only exists on Preview, so waiting for it guarantees
    // the Add Fields view has gone. Waiting for the page image alone would be
    // satisfied by the image the previous step had already rendered, and the
    // screenshot would catch Preview mid-load.
    waitFor: [page.getByText('Preview Mode'), page.locator('img[data-page-number]').first()],
  });

  // Step 10: Send Document, then Send in the dialog with its default settings.
  // Two "Send Document" buttons exist — the editor header's and the side
  // panel's. The guide uses the side panel one, which is the titled variant.
  await page.locator('button[title="Send Envelope"]').click();

  await expect(page.getByRole('heading', { name: 'Send Document' })).toBeVisible({ timeout: STEP_TIMEOUT });
  await storyboard.capture({ page, step: 10, label: 'the Send Document dialog, with its default settings' });

  await page.getByRole('button', { name: 'Send', exact: true }).click();

  // Step 11: the document shows as Pending. The guide says sending returns you
  // to the Documents list; the app actually lands on the document's own page,
  // so navigate to the list explicitly.
  log('waiting for the documents list to show Pending');
  await page.waitForURL(/\/documents\/envelope_/, { timeout: STEP_TIMEOUT });
  await page.goto('/documents');

  const documentRow = page.getByRole('row').filter({ hasText: title });
  await expect(documentRow).toContainText('Pending', { timeout: STEP_TIMEOUT });
  await storyboard.capture({ page, step: 11, label: 'the document listed as Pending' });

  // Steps 12-14: read the invitation out of Inbucket and follow its signing
  // link. The guide clicks through Inbucket's Monitor UI; this queries its REST
  // API for the same message, which still proves the email was sent and that
  // the link inside it works.
  log('waiting for the invitation email');
  const email = await waitForEmail({
    request,
    mailbox: RECIPIENT.mailbox,
    subject: INVITE_SUBJECT,
    timeout: STEP_TIMEOUT,
  });

  const signingUrl = extractSigningUrl(email);
  log(`signing link: ${signingUrl}`);

  // Step 12: a separate context stands in for the guide's incognito window —
  // the recipient must not be signing while carrying the sender's session
  // cookie, and the sender's page has to stay signed in for the final check.
  const browser = page.context().browser();

  if (!browser) {
    throw new Error('The page is not attached to a browser, so the recipient cannot get their own context.');
  }

  const recipientContext = await browser.newContext();
  const recipientPage = await recipientContext.newPage();

  try {
    await recipientPage.goto(signingUrl);
    await expect(recipientPage.locator('.konva-container canvas').first()).toBeVisible({ timeout: STEP_TIMEOUT });
    await storyboard.capture({
      page: recipientPage,
      step: 14,
      actor: 'Recipient',
      label: "the signing page, opened from the email's link",
    });

    // Step 15: the guide draws the signature by hand. The pad's Type tab
    // produces the same inserted signature without synthesised strokes.
    log('typing a signature');
    await recipientPage.getByTestId('signature-pad-dialog-button').click();
    await recipientPage.getByRole('tab', { name: 'Type' }).click();
    await recipientPage.getByTestId('signature-pad-type-input').fill(RECIPIENT.name);
    await recipientPage.getByRole('button', { name: 'Next' }).click();

    // Step 15 (continued): click the field to fill it with that signature.
    log('inserting the signature field');
    await recipientPage
      .locator('.konva-container canvas')
      .first()
      .click({ position: { x: 200, y: 200 } });
    await expect(recipientPage.getByText('0 Fields Remaining').first()).toBeVisible({ timeout: STEP_TIMEOUT });
    await storyboard.capture({
      page: recipientPage,
      step: 15,
      actor: 'Recipient',
      label: 'the signature inserted into the field',
    });

    // Step 16: Complete, then confirm with Sign in the dialog.
    log('completing');
    await recipientPage.getByRole('button', { name: 'Complete' }).click();
    await expect(recipientPage.getByRole('heading', { name: 'Are you sure?' })).toBeVisible({ timeout: STEP_TIMEOUT });
    await recipientPage.getByRole('button', { name: 'Sign', exact: true }).click();

    await expect(recipientPage.getByText('Document Signed')).toBeVisible({ timeout: STEP_TIMEOUT });
    await storyboard.capture({
      page: recipientPage,
      step: 16,
      actor: 'Recipient',
      label: 'the document signed',
    });
  } finally {
    await recipientContext.close();
  }

  // Steps 17-18: back in the sender's session, refresh until the document reads
  // Completed. Retried because the status is finalised by a background job.
  log('verifying the sender sees Completed');
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: title })).toContainText('Completed', { timeout: 2_000 });
  }).toPass({ timeout: STEP_TIMEOUT });

  await storyboard.capture({ page, step: 18, label: 'the document listed as Completed' });

  await storyboard.save({
    spec: 'packages/app-tests/e2e/documents/send-and-sign-a-document.spec.ts',
    guide: 'docs/user/guides/send-and-sign-a-document.md',
  });

  log('done');
});
