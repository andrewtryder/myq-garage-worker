# Contributing

Thank you for your interest in contributing to myq-garage-worker!

## Development setup

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy or create a `.env` file with your Cloudflare credentials if you plan to deploy locally:
   ```bash
   CLOUDFLARE_API_TOKEN=your_token_here
   ```
4. Run the dev server:
   ```bash
   npm run dev
   ```

## Quality checks

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm run format:check
npm test -- --run
```

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint. Examples:

- `feat: add webhook retry logic`
- `fix: parse stopped state from alternate subject format`
- `docs: clarify Gmail forwarding verification steps`
- `chore: bump wrangler`

Release versioning is managed by [release-please](https://github.com/googleapis/release-please); do not manually bump `package.json` version unless you are a maintainer cutting a release.

## Pull requests

1. Create a feature branch from `main`.
2. Keep changes focused and include tests when adding or changing behavior.
3. Update documentation (`README.md`, `SETUP.md`) if user-facing behavior changes.
4. Open a PR with a clear description of what changed and why.

## Reporting issues

Use the [GitHub issue tracker](https://github.com/andrewtryder/myq-garage-worker/issues). Include:

- Steps to reproduce
- Expected vs. actual behavior
- Worker version (from `package.json` or the dashboard)
- Relevant logs from `wrangler tail` if applicable

## Security

Please do not open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md).
