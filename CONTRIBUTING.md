# Contributing

Thanks for contributing to `slidev-mcp`.

## Prerequisites

- Node.js 18+
- npm

## Local setup

```bash
npm install
npm run build
```

Optional for local iteration:

```bash
npm run dev
```

## Validation

Run these before opening a PR:

```bash
npm run typecheck
npm run build
```

If you add tests, run them as part of your local checks as well.

## Pull request guidelines

- Keep changes focused and scoped to one concern.
- Update docs (`README.md`, tool descriptions) when behavior changes.
- Include a short rationale in the PR description.
- Avoid adding secrets, credentials, or machine-specific paths.

## Commit guidance

- Use clear commit messages describing intent.
- Prefer small, reviewable commits.
