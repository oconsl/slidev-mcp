# Security Policy

## Reporting a vulnerability

If you discover a security issue, please report it privately to the maintainers.

- Do not open a public issue for sensitive vulnerabilities.
- Include clear reproduction steps and impact details.
- If possible, provide a minimal proof of concept and suggested mitigation.

Until a dedicated security contact is configured, open a private channel with project maintainers through GitHub account contact options.

## Supported versions

Security fixes are typically applied to the latest version on the default branch.

## Safe-use notes

`slidev-mcp` can read/write project files and execute local commands (`npm`, `npx slidev`) in workspace directories.

To reduce risk:

- Run only in trusted local repositories.
- Do not grant it access to directories containing unrelated sensitive files.
- Do not run as root/administrator.
- Review generated changes before committing or publishing.
