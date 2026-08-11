# Documenso — Security Overview

Documenso treats trust as its core product value, not an afterthought: every e-signature tool sits as an implicit trusted third party between the people signing a document, and Documenso's answer to that is openness. Because the source is public and self-hostable, organizations can audit exactly how documents are stored, how signatures are applied, and how certificates are handled, instead of relying on a vendor's word. Cryptographic signing is handled by a dedicated `packages/signing` module, with certificate setup documented in `SIGNING.md`. Vulnerability handling is formalized in `SECURITY.md`, which defines a private reporting process, response expectations, and scope. The project also runs automated security analysis (Codex) across the codebase in addition to manual review. Together these practices are meant to make Documenso's security posture verifiable rather than merely claimed.

## FAQ

**What is meant by "implicit trusted third party"?**
Whenever you use a signing tool, you're trusting that provider to correctly and honestly handle your documents and signatures, even though no one explicitly asked you to trust them — it comes bundled with using the service. Documenso argues this trust should be earned through transparency (open source, self-hosting) rather than assumed.

**Describe SIGNING.md**
`SIGNING.md` explains that Documenso needs a digital signing certificate to sign documents, and points to the official docs for generating, converting, and configuring one (including a local self-signed `.p12` certificate or Google Cloud KMS/HSM), plus guides for Docker-based deployment.

**Describe SECURITY.md**
`SECURITY.md` is the project's security policy: it explains how to privately report vulnerabilities (GitHub Security Advisories preferred, or email), what triage and response to expect, what's in and out of scope (app-level issues are in scope; infra/deployment concerns like SSRF, DNS, rate limiting, and TLS config are out of scope), and that fixes are only applied to the latest release.
