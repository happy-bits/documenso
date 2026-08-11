# Documenso — User Overview

Documenso is an open-source alternative to DocuSign for signing documents digitally. You upload a PDF, place fields like signatures, dates, and text on it, and send it to one or more recipients to sign. Recipients can sign from any browser without needing an account, and you can track the status of every document as it moves through the signing process. Documenso can be used as a hosted service at documenso.com or self-hosted on your own infrastructure. Templates, teams, and an API are available for automating and scaling how documents get sent and signed. Because the project is open source, anyone can inspect how signing and document handling actually work under the hood.

## User Roles

Documenso has roles at three levels:

- **Account role** — a user is either a regular **User** or a site-wide **Admin** (access to the instance's admin panel).
- **Organisation role** — within an organisation, a member is an **Admin** (full control, including billing and deletion), **Manager** (can manage settings/members, can't delete or manage billing), or **Member** (base access, no management rights). Teams within an organisation use the same Admin/Manager/Member hierarchy and also control who can view documents at restricted visibility levels.
- **Document recipient role** — when you send a document, each recipient is assigned a role: **Signer** (must sign), **Approver** (must approve, and optionally sign, before the document can complete), **Viewer** (must open/acknowledge the document), **Assistant** (prepares fields for later signers in a sequential flow, but doesn't sign themselves), or **CC** (gets a copy of the completed document only, with no action required).

## FAQ

**What is DocuSign?**
DocuSign is a widely used commercial e-signature platform that lets people sign documents electronically instead of printing, signing, and scanning them. Documenso provides similar functionality as an open-source alternative.

**What are the benefits of open source?**
Open source means the code is publicly available to read, audit, and modify, so you don't have to blindly trust a vendor's claims about how your documents and signatures are handled. It also lets you self-host for full control over your data, and benefit from community contributions and scrutiny that can improve security and features over time.
