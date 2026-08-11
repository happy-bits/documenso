# Documenso — Contributor Overview

Documenso invests in a documented, consistent contributor experience even though it no longer accepts external pull requests directly — `CONTRIBUTING.md` explains that the best way to contribute now is through detailed, spec-like issues, with PRs reserved for a small group of trusted contributors. Local development is Docker-based, with a `docker/` directory covering development, production, and testing setups, plus a devcontainer option for a zero-setup environment. The codebase enforces consistency through `CODE_STYLE.md`, `WRITING_STYLE.md`, and `ARCHITECTURE.md`, along with tooling like Biome for linting and commitlint for commit hygiene. Internationalization is handled with Lingui, extracting translatable strings from the app into per-locale catalogs synced via Crowdin. Contributions must be written in English so maintainers and the wider community can follow discussions regardless of contributor origin.

## FAQ

**Why is Docker used?**
Docker gives every contributor an identical local environment (database, services, dependencies) without manually installing and configuring them, which avoids "works on my machine" issues. It's also used for building production images and running tests consistently in CI.

**i18n?**
Documenso uses Lingui to extract translatable strings from the Remix app, UI, lib, and email packages into per-locale catalog files. Translations are synced through Crowdin (configured in `crowdin.yml`) so the app can be localized into multiple languages.
