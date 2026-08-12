# Guide: Create a Template with a Direct Signing Link

This guide tests the template and direct-link-signing features. A direct signing link lets anyone with the URL sign a document generated from a template, without you having to name the recipient in advance and without them needing an account.

Step numbers are continuous across the whole guide, so "Step 12" always refers to the same single step no matter which section it falls under.

## Setup

1. Make sure the local stack is running. If you have never set up this project's local dev environment before, run `npm run dx` instead — it installs dependencies, starts the Docker services, runs database migrations, and seeds the database in one step. Otherwise, run `npm run dev`.
2. Reset the database to a known state: `npm run prisma:migrate-reset`. When prompted to confirm, type `y` and press Enter. This drops and recreates the database, then automatically seeds it with the account `example@documenso.com` / `password`.
   > If you're repeating this guide often (e.g. for manual regression testing), `prisma:migrate-reset` re-runs migrations and seeding every time, which is slow. You can speed this up by building a seeded template database once with `npm run db:template:create`, then using `npm run db:template:reset` afterwards to reset in about a second instead. Re-run `db:template:create` whenever migrations or seed data change, since `db:template:reset` just clones whatever the template currently contains.
3. Open `http://localhost:3000` in your browser.

## Steps

4. Log in with `example@documenso.com` / `password`.
5. In the top navigation bar, click **Templates**.
6. Drag any PDF file from your computer onto the page to create a new template from it. If a separate **Template (Legacy)** button is visible next to the upload area, ignore it — only use drag-and-drop or the plain **Upload Template** button, otherwise later steps in this guide won't match.
7. You'll be taken to the template editor, which has three steps shown on the left: **Document & Recipients**, **Add Fields**, and **Preview**. It opens on **Document & Recipients** — leave the defaults as they are, then click the **Add Fields** step.
8. On **Add Fields**, confirm **Recipient 1** is selected under "Selected Recipient", then drag the **Signature** field from the panel onto the document. Click the **Preview** step.
9. On **Preview**, confirm the document looks correct.
10. In the **Quick Actions** section of the left sidebar, click **Direct Link**.
11. A "Create Direct Signing Link" dialog opens explaining how it works. Click **Enable direct link signing**.
12. On the "Choose Direct Link Recipient" screen that follows, click the row for your existing **Signer** recipient (not "Create one automatically", which would create a second, fieldless recipient). This takes you straight to the "Direct Link Signing" management screen.
13. On that "Direct Link Signing" screen, click on the icon to copy the the shareable link. Paste it somewhere you can read it — it will look like `http://localhost:3000/d/{token}`. The link is already live at this point; you can close the dialog without clicking **Save**.

## Sign via the Direct Link

14. Open a private/incognito browser window (so you are not logged in).
15. Paste the copied link into the address bar and load it.
16. You'll land directly on the "Sign Document" page (no email is asked for, since the template was created with drag-and-drop in step 6).
17. On the "Sign Document" page, in the left sidebar, enter the full name `John Direct` into the **Full Name** field. This makes a cursive signature preview appear in the sidebar's **Signature** box, but that preview alone does not fill the field — you must also click the green-outlined **Signature** box directly on the document itself. Clicking it applies that signature to the field; "1 Field Remaining" should now become "0 Fields Remaining" and the header button changes from **Next Field** to **Complete**.
18. An "Are you sure?" confirmation dialog opens with **Your Name** pre-filled as `John Direct`. Enter `john.direct@documenso.com` into **Your Email**, then click **Sign** to finish signing. You'll then land on a "Document Signed" page alongside a "Claim account" panel prompting you to create an account — that panel is a normal upsell and can be ignored.

## Verify

19. Back in the logged-in browser tab (as `example@documenso.com`), go to **Documents** — a new completed document generated from the template should appear, with `John Direct` listed as the signer and status **Completed** (look for initials JD)
20. Open that document and confirm the signature you drew appears on the field.
21. Go back to the template, open **Manage Direct Link**, toggle **Enable Direct Link Signing** off, then click **Save**, to confirm the link stops working — reloading the same `http://localhost:3000/d/{token}` URL should now show a 404 Not Found page instead of the signing page.
