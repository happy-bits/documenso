---
name: getting-started
description: Orient a new contributor to the Documenso local dev setup — runs the troubleshoot skill, then explains which commands start the site, how to log in, and how the monorepo is put together. Use when the user asks "how do I get started", "how do I run this", "how does this project work", or is new to the codebase. Informational only — never starts the site or fixes anything itself.
---

# Getting started with Documenso (local dev)

This skill only **explains** — it never starts the app, edits files, or runs
fixes. If problems are found, report them and let the user decide (or run
`/troubleshoot` fixes themselves).

## Steps

1. **Run the `troubleshoot` skill first.** Invoke it (`Skill` tool with
   `skill: "troubleshoot"`) and let it report environment/Docker/database
   status. Summarize its result in 1-3 lines before moving on — if it found
   failures, mention them but continue with the rest of this skill anyway
   (the user may just want the information regardless).

2. **Show the commands to run the site**, explained rather than just listed:

   - First time only: `npm run dx` — installs deps, brings up the Docker
     services (Postgres, Redis, MinIO, Inbucket, Gotenberg), runs Prisma
     migrations, and seeds the database.
   - Every day after that: `npm run dev` — compiles translations and starts
     the Remix app (`apps/remix`) via Turbo.
   - `npm run d` — shorthand that chains `dx` and `dev` together, useful
     after pulling changes that might need a fresh migrate/seed.
   - Once running, the app is at **http://localhost:3000**.
   - Useful side tools started by Docker: Inbucket (fake mail catcher) at
     **http://localhost:9000** — every "verify your email" / signing
     notification email sent by the dev app lands here instead of a real
     inbox. MinIO console at **http://localhost:9001** for uploaded file
     storage.
   - `npm run prisma:studio` opens a GUI over the database.
   - `npm run prisma:seed` re-seeds demo data if needed (safe to re-run —
     the seed script checks for existing users first).

3. **Explain how to log in**, from `packages/prisma/seed/initial-seed.ts`:

   - Admin account: `admin@documenso.com` / `password`
   - Regular account: `example@documenso.com` / `password`

   Both come pre-loaded with example documents, templates, and a pending
   signature request between the two accounts, so there's real data to poke
   at immediately after login. Mention that any email the app tries to send
   (magic links, signing invites) can be read in Inbucket rather than a real
   mailbox, since local dev has no real SMTP provider configured.

4. **Give a short, educational tour of how the pieces fit together** — keep
   this tight (a handful of lines, not an essay), and adapt depth to what
   the user seems to want:

   - This is an **npm workspaces monorepo** orchestrated by **Turborepo**.
   - `apps/remix` — the actual web app (React Router / Remix), the thing
     `npm run dev` starts. `apps/docs` and `apps/openpage-api` are separate
     apps (docs site, public API) started via their own `dev:*` scripts.
   - `packages/prisma` — the Postgres schema, migrations, and seed data
     (what you just ran diagnostics and seeding against).
   - `packages/trpc` — the typed API layer the frontend calls into.
   - `packages/lib` — shared business logic (documents, envelopes, fields).
   - `packages/auth` — authentication/session logic.
   - `packages/signing` — the actual PDF signing/certificate logic.
   - `packages/email` — transactional email templates (the things that show
     up in Inbucket locally).
   - `packages/ui` — the shared component library used across apps.
   - `packages/ee` — enterprise-only features, gated separately.
   - Local infra (Postgres, Redis, MinIO, Inbucket, Gotenberg for PDF
     rendering) all runs via `docker/development/compose.yml`, brought up
     by `npm run dx:up`.

5. **End with a suggestion for what to do next**, e.g.:
   - "Want me to run `npm run dev` for you?" (only offer — don't run it)
   - "Want a tour of a specific package (e.g. how signing works)?"
   - If troubleshoot found failures, point back to those fixes.

## Notes

- Credentials and seed behavior come from `packages/prisma/seed/*.ts` — if
  that file changes, re-check it rather than trusting this description
  blindly.
- Do not run `npm run dev`, `npm run dx`, or any fix command as part of this
  skill. Only the read-only `troubleshoot` skill runs automatically.
