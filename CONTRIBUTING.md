# Contributing to Documenso

> **We are no longer accepting external pull requests.**
>
> Aside from a small group of trusted contributors we reach out to directly, we no longer merge external PRs. New pull requests will usually be closed with a request to open an issue instead. This is a security decision, not a judgement on your work. Read [Why We're Pausing External Pull Requests](https://documenso.com/blog/why-we-re-pausing-external-pull-requests) for the full reasoning.
>
> Documenso stays open source. You can still read, audit, run, and fork the code. The best way to contribute is through detailed issues.

## How to contribute now

The most useful contribution is a detailed issue. Treat it like a spec. The more detail, the better:

- The problem you're trying to solve, and who it affects
- How you expect the feature or change to behave
- Edge cases, constraints, and anything you've already considered
- Examples, mockups, or references where they help

Before opening an issue, search [existing issues](https://github.com/documenso/documenso/issues) and [discussions](https://github.com/documenso/documenso/discussions) for related items. If a proposal is detailed and fits where Documenso is heading, we'll pick it up and build against it.

For security vulnerabilities, do not open a public issue. Follow our [Security Policy](./SECURITY.md) instead.

---

The sections below are for trusted contributors working with us directly, and for anyone running Documenso locally or maintaining a fork.

## English only PRs and Issues

Please write all issues, pull requests, and related comments in English so maintainers and the wider contributor community can follow the discussion.

## Taking issues

Before taking an issue, ensure that:

- The issue has been assigned the public label
- The issue is clearly defined and understood
- No one has been assigned to the issue
- No one has expressed intention to work on it

You can then:

1. Comment on the issue with your intention to work on it
2. Begin work on the issue

Always feel free to ask questions or seek clarification on the issue.

## Developing

The development branch is <code>main</code>. All pull requests should be made against this branch. If you need help getting started, [join us on Discord](https://documen.so/discord).

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your
   own GitHub account and then
   [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device.
2. Create a new branch:

- Create a new branch (include the issue id and something readable):

  ```sh
  git checkout -b feat/doc-999-somefeature-that-rocks
  ```

3. See the [Developer Setup](https://github.com/documenso/documenso/blob/main/README.md#developer-setup) for more setup details.

## Building

> **Note**
> Please ensure you can make a full production build before pushing code or creating PRs.

You can build the project with:

```bash
npm run build
```

> **Important**: All AI-generated code must be thoroughly reviewed by the contributor before submitting a PR. You are responsible for understanding and validating every line of code you submit. If we detect that contributors are simply throwing AI-generated code over the wall without proper review, they will be blocked from the repository.
