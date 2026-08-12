# Guide: Enable Two-Factor Authentication and Test Recovery Codes

This guide tests account-security features: enabling TOTP-based two-factor authentication (2FA), signing in with a 2FA code, and using a one-time backup/recovery code as a fallback.

You'll need the Google Authenticator app installed on your phone.

## Setup

1. Make sure the local stack is running. If you have never set up this project's local dev environment before, run `npm run dx` instead — it installs dependencies, starts the Docker services, runs database migrations, and seeds the database in one step. Otherwise, run `npm run dev`.
2. Reset the database to a known state: `npm run prisma:migrate-reset`. When prompted to confirm, type `y` and press Enter. This drops and recreates the database, then automatically seeds it with the account `example@documenso.com` / `password`.
3. Open `http://localhost:3000` in your browser.

## Steps

4. Log in with `example@documenso.com` / `password`.
5. Navigate to `http://localhost:3000/settings/security`.
6. Click **Enable 2FA**.
7. In the "Enable Authenticator App" dialog, open Google Authenticator, tap the **+** button, tap **Scan a QR code**, and scan the QR code shown in the dialog.
8. Enter the 6-digit code your authenticator app shows, then click **Enable 2FA**.
9. The same dialog's content swaps to show a "Backup codes" screen with a list of one-time recovery codes (this is not a separate dialog). Click **Download** to save them, then write down or note the first code in the list for the next step (you'll need it since you can't reopen this screen later). Click **Close**.
10. If the dialog already closed before you saw the codes in step 9, go to `http://localhost:3000/settings/security`, find the **Recovery codes** card, and click **View Codes**. In the "View Recovery Codes" dialog, enter a current 6-digit code from Google Authenticator and click **View** — this shows the same codes generated in step 9 (they are not regenerated). Note one down, then click **Close**.

## Verify Sign-In with a 2FA Code

11. Log out of the account.
12. Log back in with `example@documenso.com` / `password`.
13. You should be prompted for a 2FA code. Open your authenticator app, read the current 6-digit code, enter it, and submit.
14. Confirm you're signed in successfully and land on the dashboard.

## Verify a Backup Code Works as a Fallback

15. Log out again.
16. Log back in with `example@documenso.com` / `password`.
17. When prompted for a 2FA code, click **Use Backup Code**.
18. Enter the recovery code you noted earlier and submit.
19. Confirm you're signed in successfully.

## Cleanup

20. Go back to `http://localhost:3000/settings/security`.
21. Click **Disable 2FA**. In the confirmation dialog, enter a current code from your authenticator app (or click **Use Backup Code** and enter one of your remaining recovery codes), then confirm.
22. Confirm the page now shows 2FA as disabled, returning the `example@documenso.com` account to its original state for future tests.
