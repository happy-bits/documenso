# Guide: Send a Document for Signature and Complete Signing

This guide walks through the core Documenso flow end to end: uploading a document, sending it to a recipient, and signing it as that recipient. You'll use the local mail catcher (Inbucket) to read the signing email without needing a real inbox.

Step numbers are continuous across the whole guide, so "Step 12" always refers to the same single step no matter which section it falls under.

## Setup

1. Make sure the local stack is running. If you have never set up this project's local dev environment before, run `npm run dx` instead — it installs dependencies, starts the Docker services, runs database migrations, and seeds the database in one step. Otherwise, run `npm run dev`.
2. Reset the database to a known state: `npm run prisma:migrate-reset`. When prompted to confirm, type `y` and press Enter. This drops and recreates the database, then automatically seeds it with two accounts, both with password `password`:
   - `admin@documenso.com`
   - `example@documenso.com`
3. Open `http://localhost:3000` in your browser.

## Steps

4. Log in with `admin@documenso.com` / `password`.
5. In the top navigation bar, click **Documents**.
6. Drag any PDF file from your computer onto the page (the drop zone overlay will read "Upload Document"). If you don't have a PDF handy, use any short PDF — a single page is enough.
7. You'll be taken to the document editor, which has three steps shown on the left: **Document & Recipients**, **Add Fields**, and **Preview**. It opens on **Document & Recipients** — add a recipient with the name `Jane Recipient` and the email `jane.recipient@documenso.com`, leaving the role as **Signer**. Click the **Add Fields** step.
8. On **Add Fields**, select Jane Recipient, then drag a **Signature** field onto the document page. Click the **Preview** step.
9. On **Preview**, confirm the document and recipient look correct.
10. In the editor's side panel, click **Send Document**. A "Send Document" dialog opens — leave the settings as they are and click **Send**.
11. You'll land back on the Documents list. The document you just sent should show status **Pending**.

## Sign as the Recipient

12. Open a private/incognito browser window (so this session is separate from your logged-in `admin@documenso.com` session) and go to `http://localhost:9000/monitor` (Inbucket's Monitor page, which lists incoming mail across all mailboxes as it arrives).
13. Find the row with mailbox `jane.recipient` and subject "Personal Team invited you to sign a document", and click it to open the email.
14. Click the signing link inside the email — it will open `http://localhost:3000/sign/{token}` in the incognito window.
15. On the signing page, click the signature field you added and draw a signature with your mouse or trackpad to fill it in. Click **Sign**.
16. Click **Complete**. A confirmation dialog opens — click **Sign** to finish signing.

## Verify

17. Switch back to the tab logged in as `admin@documenso.com` and refresh the Documents list.
18. The document's status should now read **Completed**.
19. Open the document, by clicking at the title of the document, and confirm you can view or download the signed PDF, and that it shows Jane Recipient's signature on the field you placed.
20. Log in as `example@documenso.com` / `password` — since the seed data is independent of this document, you should still see its 8 seeded documents untouched (`Example Document 1`–`4`, `Pending Document`, `Overflow Test`, and two `Envelope Full Field Test` documents), confirming this test didn't affect other accounts.
