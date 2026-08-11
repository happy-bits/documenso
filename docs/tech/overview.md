# Documenso — Technical Overview

Documenso is a TypeScript monorepo managed with Turborepo, containing multiple apps and shared packages. The main product is a Remix-based web app (`apps/remix`), alongside a separate public API app (`apps/openpage-api`). Shared logic lives under `packages/`, including `trpc` for typed client-server API calls, `prisma` for database access, `auth` for authentication, `signing` for the cryptographic PDF-signing engine, `email` for transactional email, `ui` for shared components, and `ee` for enterprise-edition-gated features. This structure lets the core open-source product and paid enterprise features share code while keeping enterprise logic cleanly isolated. Tooling like Biome (linting), Lingui (i18n), and commitlint (commit hygiene) keeps the codebase consistent across packages.

## FAQ

**What is Turborepo?**
Turborepo is a build system for JavaScript/TypeScript monorepos. It caches build/test outputs and runs tasks across multiple packages in parallel, so only what actually changed gets rebuilt.

**What is Remix?**
Remix is a full-stack React web framework that handles routing, data loading, and form submissions on both server and client. Documenso's main web app is built on it.

**What is tRPC?**
tRPC lets you define API endpoints as regular TypeScript functions and call them from the frontend with full type safety, without writing separate schemas or client code. Documenso uses it for typed communication between its client and server.
