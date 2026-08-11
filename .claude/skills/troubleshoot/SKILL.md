---
name: troubleshoot
description: Diagnose why the local Documenso dev environment isn't working — checks Node/npm versions, Docker, compose containers, ports, .env, database connectivity, migrations, and seed data. Use when the user says the app won't start, won't load, errors on boot, or asks "why doesn't this work" / "troubleshoot" / "diagnose" for local dev.
allowed-tools: Bash(node .claude/skills/troubleshoot/troubleshoot.mjs)
---

# Troubleshoot local dev environment

Diagnoses the local dev environment and reports problems. **This skill only
reports — it never fixes anything on its own.**

## Steps

1. Run the diagnostic script from the repo root:

   ```bash
   node .claude/skills/troubleshoot/troubleshoot.mjs
   ```

   It prints a single JSON object: `{ "checks": [{ id, label, status, detail, fix }] }`
   where `status` is `"ok"`, `"warn"`, or `"fail"`, and `fix` is either `null`
   or a shell command that would resolve that specific problem.

2. Present the results to the user as a readable list, one line per check,
   using these symbols for `status`:

   - `ok` → ✅
   - `warn` → ⚠️
   - `fail` → ❌

   Format each line as:

   ```
   ✅ Node.js version — v24.16.0 (>= 22 required)
   ✅ Docker installed — Docker version 29.6.2, build dfc4efb
   ⚠️ Container: database — running but health=unhealthy
   ❌ Seed data (superadmin user) — no admin user found — database has not been seeded
   ```

   Group them logically (environment/tooling, Docker & containers, ports,
   config, database) rather than dumping them in raw script order — this
   roughly matches the order the script already emits them in.

3. After the list, add a one-line summary (e.g. "3 issues found: 1 warning,
   2 failures.") If everything is `ok`, say so clearly and stop — there is
   nothing to offer to fix.

4. If there are any `warn`/`fail` checks that have a non-null `fix`, list the
   proposed fix command(s) next to each finding, then **ask the user**
   whether they want you to run them (e.g. via `AskUserQuestion` or a plain
   question) — one at a time or all together. Do not run any `fix` command,
   or take any other corrective action, until the user explicitly says yes.

5. For checks with `fail`/`warn` but no `fix` (e.g. Docker not installed,
   Node version too low, a port occupied by an unknown process) — explain
   the problem and let the user decide how to proceed manually; there's
   nothing to auto-run for those.

## Notes

- The script is read-only: it inspects Docker, ports, the `.env` file, and
  queries the database, but never mutates anything.
- If Docker isn't installed or isn't running, downstream checks (containers,
  database, migrations, seed data) are reported as skipped/failed rather than
  silently omitted — surface those as failures too, don't drop them.
