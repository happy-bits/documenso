---
name: create-testing-guide
description: Investigate a project's test setup and write a concise onboarding guide (what tests exist, why, how to run them, how to prove they work by breaking one on purpose). Technology-agnostic — works for any language/framework, not just this repo. Use when the user asks to "document testing", "write a testing guide", "create testing.md", or wants a new contributor to understand how tests work here. Verifies every command by actually running it before writing it down.
---

# Create a testing guide

Produces a short, practical Markdown guide to a project's test setup — modeled
on the process used to write this repo's own `docs/testing.md`. Works for any
project regardless of language or test framework; nothing below is specific
to this codebase.

The guide this skill produces is only as good as the commands in it actually
being true. **Every command that goes in the guide must be run for real
first** — reading `package.json` tells you a script *exists*, not that it
*works*. Assume the first attempt at several of these commands will fail for
reasons invisible from source alone (a missing env var, a port collision, a
service that isn't running, a stale build) — that's expected, not a blocker.
Fix or note it, then move on.

## Steps

1. **Discover what test frameworks and categories exist.** Look at:
   - Root and per-package/module manifest files (`package.json` scripts,
     `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, build files) for
     test-related dependencies and scripts.
   - Config files (`vitest.config.*`, `jest.config.*`, `playwright.config.*`,
     `pytest.ini`, `.rspec`, etc.) — these reveal projects/suites, worker
     counts, timeouts, and retry behavior worth surfacing later.
   - Actual test files, grouped by directory — unit tests are usually fast
     and colocated with source; integration/e2e tests are usually in a
     dedicated directory and need more setup (a database, a running server,
     Docker services).
   - CI workflow files (`.github/workflows/*.yml`, `.gitlab-ci.yml`,
     etc.) — these show the ground-truth commands and env vars a maintainer
     already trusts, and often reveal flags worth reusing locally (e.g. a
     rate-limit bypass, a bypass for slow external calls).

   If you can, delegate this discovery to a subagent (fast, read-only,
   doesn't need to keep raw file contents in your context) and have it report
   back a structured summary: frameworks, categories, example files per
   category, run commands, CI integration.

2. **Ask only if genuinely ambiguous, and only once per topic.** Don't ask
   about things inferable from the repo (e.g. don't ask "where should the
   guide live" if a `docs/` directory with a clear convention already
   exists). Do ask about things that are truly the user's call — e.g. which
   test framework/project to feature in worked examples if there are several
   plausible choices, or where a new guide should live if there's no existing
   docs convention.

3. **Verify commands by running them, not by reading them.** Before writing
   any command into the guide:
   - Actually run it (or a cheap/fast variant of it if the real one is slow
     or destructive — e.g. run one file instead of the whole suite first).
   - If it fails, diagnose the real cause (missing env var, wrong working
     directory, a service not running, a stale build, a port already in use)
     rather than guessing. Use whatever the project's own diagnostics are
     (an existing troubleshoot skill/script, `docker ps`, `lsof`, reading the
     actual error) before speculating.
   - Time it. A rough wall-clock estimate ("~1s", "~2 min", "~20 min") is far
     more useful to a reader than no estimate — it tells them whether to
     wait or go get coffee, and whether something is unusually slow.
   - Any real problem you hit and solve while verifying becomes a
     troubleshooting note in the guide (see step 5) — these are more
     valuable than anything you could invent from reading code, because
     they're proven to actually happen.

4. **Structure the guide for a fast feedback loop — narrow first, wide
   last.** For each test category:
   - State briefly: where the tests live, what they're for (in terms of
     what they actually protect against — read a couple of representative
     tests to describe this concretely, not generically), and what's
     required to run them (nothing? a database? Docker services? a running
     server?).
   - Show commands in this order: single test/file first (fastest, cheapest
     failure to diagnose) → one logical group/suite next → the entire
     category last (slowest, hardest to debug when something's wrong).
     Say explicitly why: narrow-first gives a fast feedback loop, so a
     misconfigured environment surfaces in seconds against one test instead
     of minutes into a large run.
   - If a command takes minutes rather than seconds, say so up front and
     consider moving it to a separate "running many tests at once" section
     at the end of the guide, so the reader doesn't reach for it by default.
   - **Don't present equivalent alternatives as a menu.** If there are two
     ways to do the same thing (e.g. two flags, headless vs. a debug mode),
     pick the one to recommend as the default path. Mention the other only
     if it serves a genuinely different purpose (e.g. one is for watching
     the test run visually, not just an alternative invocation).

5. **Attach troubleshooting notes at the exact step they apply to**, not in
   a separate FAQ dumped at the end. Format: a short callout right after the
   command that can trigger it, naming the actual symptom (the literal error
   text, if there is one) and the real fix you verified. Prefer notes earned
   from step 3's real failures over hypothetical ones. If the project has an
   existing diagnostic tool/skill (health checks, env validators), point to
   it for open-ended "why won't this start" problems instead of re-deriving
   that logic in the guide.

6. **Show how to prove a test actually works**, per category, by breaking
   one on purpose — but keep it light: name the file to change and the
   command to re-run, don't spell out the exact line-by-line diff. E.g. "to
   see this test catch something, change a line in `<file>` and re-run
   `<command>` — it should fail; revert and confirm green again." This
   matters because a test suite nobody has seen fail is unverified — showing
   this is often more convincing to a new contributor than the tests passing
   ever was.

7. **Write and place the guide.** Prefer Markdown, prefer an existing docs
   location/convention if the project has one (a `docs/` folder, a wiki
   convention referenced in `CONTRIBUTING.md`, etc.). Keep the whole guide
   skimmable — short paragraphs, commands in fenced code blocks, callouts
   (`> **...**`) for troubleshooting notes, not long prose.

## Notes

- This skill is about producing the guide, not fixing the project's test
  setup. If you hit a real bug while verifying (not just a documentation
  gap — e.g. a genuine tool bug, a broken CI step), mention it to the user
  rather than silently working around it in the guide.
- Revisit and tighten the guide as real usage surfaces more edge cases —
  treat it as living documentation, not a one-shot artifact. If the user
  reports a new failure while following the guide, verify the real cause
  first (per step 3) before adding or editing a troubleshooting note.
- Don't assume a framework's flags/behavior from general knowledge if the
  installed version might differ — check the actual installed version and
  its own `--help`/docs when something surprising happens (e.g. a flag that
  should exist but doesn't).
