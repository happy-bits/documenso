import { Client } from 'pg';

/**
 * Snapshots the rows a signing flow actually touches, so the storyboard can
 * show what changed in the database alongside what changed on screen.
 *
 * Reuses `NEXT_PRIVATE_DATABASE_URL`, the same connection `global-setup.ts`
 * checks before the suite runs — no separate configuration to keep in sync.
 * Raw SQL rather than the Prisma client: this package has no dependency on
 * `@documenso/prisma`, and a handful of read-only queries do not justify
 * adding one.
 */

export type DatabaseSnapshot = {
  envelope: { status: string; completedAt: boolean } | null;
  recipients: Array<{
    name: string;
    role: string;
    sendStatus: string;
    signingStatus: string;
    readStatus: string;
    signedAt: boolean;
  }>;
  fields: Array<{ type: string; page: number; recipient: string; inserted: boolean }>;
  signatures: Array<{ recipient: string; method: string }>;
  // Audit log types only, oldest first — the count and order are what change
  // step to step, and the row's other columns (ip, user agent) are noise here.
  auditLog: string[];
};

export type DatabaseSnapshotter = {
  // Accepts either `Envelope.id` or its user-facing `secondaryId` (the
  // `envelope_...` value in the URL), so callers can pass whichever they have
  // on hand without looking up the other.
  snapshot: (envelopeId: string) => Promise<DatabaseSnapshot>;
  close: () => Promise<void>;
};

export const createDatabaseSnapshotter = (): DatabaseSnapshotter => {
  const databaseUrl = process.env.NEXT_PRIVATE_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('NEXT_PRIVATE_DATABASE_URL is not set. Is .env.test present?');
  }

  const client = new Client({ connectionString: databaseUrl });
  let connected: Promise<void> | null = null;

  const ensureConnected = () => {
    connected ??= client.connect();
    return connected;
  };

  return {
    snapshot: async (envelopeId) => {
      await ensureConnected();

      const envelope = await client.query(
        `SELECT id, status, "completedAt" FROM "Envelope" WHERE id = $1 OR "secondaryId" = $1`,
        [envelopeId],
      );

      if (envelope.rows.length === 0) {
        return { envelope: null, recipients: [], fields: [], signatures: [], auditLog: [] };
      }

      // Resolve to the internal id once: the joins below are cheaper keyed on
      // it directly than repeating the id-or-secondaryId lookup per table.
      const id = envelope.rows[0].id;

      const [recipients, fields, signatures, auditLog] = await Promise.all([
        client.query(
          `SELECT name, role, "sendStatus", "signingStatus", "readStatus", "signedAt"
           FROM "Recipient" WHERE "envelopeId" = $1 ORDER BY id`,
          [id],
        ),
        client.query(
          `SELECT f.type, f.page, f.inserted, r.name AS recipient
           FROM "Field" f JOIN "Recipient" r ON r.id = f."recipientId"
           WHERE f."envelopeId" = $1 ORDER BY f.id`,
          [id],
        ),
        client.query(
          `SELECT r.name AS recipient,
                  CASE WHEN s."typedSignature" IS NOT NULL THEN 'typed' ELSE 'drawn' END AS method
           FROM "Signature" s JOIN "Recipient" r ON r.id = s."recipientId"
           JOIN "Field" f ON f.id = s."fieldId"
           WHERE f."envelopeId" = $1 ORDER BY s.id`,
          [id],
        ),
        client.query(`SELECT type FROM "DocumentAuditLog" WHERE "envelopeId" = $1 ORDER BY "createdAt"`, [id]),
      ]);

      return {
        envelope: {
          status: envelope.rows[0].status,
          completedAt: envelope.rows[0].completedAt !== null,
        },
        recipients: recipients.rows.map((row) => ({
          name: row.name,
          role: row.role,
          sendStatus: row.sendStatus,
          signingStatus: row.signingStatus,
          readStatus: row.readStatus,
          signedAt: row.signedAt !== null,
        })),
        fields: fields.rows.map((row) => ({
          type: row.type,
          page: row.page,
          recipient: row.recipient,
          inserted: row.inserted,
        })),
        signatures: signatures.rows.map((row) => ({ recipient: row.recipient, method: row.method })),
        auditLog: auditLog.rows.map((row) => row.type),
      };
    },

    close: async () => {
      if (connected !== null) {
        await connected;
        await client.end();
      }
    },
  };
};
