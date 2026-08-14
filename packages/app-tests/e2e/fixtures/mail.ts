import type { APIRequestContext } from '@playwright/test';

/**
 * Inbucket's web/API port in the *test* stack (`docker/testing/compose.yml`
 * maps 9010 -> 9000). The development stack uses 9000, which is what the user
 * guide documents — do not "correct" this to 9000.
 */
export const INBUCKET_URL = process.env.E2E_INBUCKET_URL ?? 'http://localhost:9010';

type InbucketMessageHeader = {
  id: string;
  subject: string;
  date: string;
};

type InbucketMessage = {
  id: string;
  subject: string;
  body: {
    text: string;
    html: string;
  };
};

/**
 * Waits for a message matching `subject` to land in `mailbox`, then returns it.
 *
 * Mail is sent by a job that runs in-process (`NEXT_PRIVATE_JOBS_PROVIDER=local`)
 * but still asynchronously, so the mailbox is polled rather than read once.
 * The mailbox name is the local part of the address, e.g. `jane.recipient`.
 */
export const waitForEmail = async ({
  request,
  mailbox,
  subject,
  timeout = 10_000,
}: {
  request: APIRequestContext;
  mailbox: string;
  subject: string;
  timeout?: number;
}): Promise<InbucketMessage> => {
  const deadline = Date.now() + timeout;

  let seenSubjects: string[] = [];

  while (Date.now() < deadline) {
    const response = await request.get(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`);

    if (response.ok()) {
      const headers: InbucketMessageHeader[] = await response.json();

      seenSubjects = headers.map((header) => header.subject);

      const match = headers.find((header) => header.subject.includes(subject));

      if (match) {
        const messageResponse = await request.get(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${match.id}`);

        if (!messageResponse.ok()) {
          throw new Error(`Could not read message ${match.id} from "${mailbox}": ${messageResponse.status()}`);
        }

        return messageResponse.json();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `No email with subject containing "${subject}" arrived in "${mailbox}" within ${timeout}ms.\n` +
      `Subjects seen: ${seenSubjects.length ? seenSubjects.join(', ') : '(mailbox empty)'}\n` +
      `Is the test Inbucket up at ${INBUCKET_URL}?`,
  );
};

/**
 * Deletes every message in a mailbox so a test's assertions cannot match mail
 * left behind by an earlier run — Inbucket keeps its state in the container,
 * which outlives the database reset.
 */
export const clearMailbox = async ({ request, mailbox }: { request: APIRequestContext; mailbox: string }) => {
  await request.delete(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`);
};

/**
 * Pulls the signing URL out of an invitation email.
 */
export const extractSigningUrl = (message: InbucketMessage): string => {
  const source = `${message.body.html}\n${message.body.text}`;

  const match = source.match(/https?:\/\/[^\s"'<>]*\/sign\/[A-Za-z0-9_-]+/);

  if (!match) {
    throw new Error(`No /sign/{token} link found in email "${message.subject}".`);
  }

  return match[0];
};
