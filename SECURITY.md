# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue.

Instead, use [GitHub Security Advisories](https://github.com/andrewtryder/myq-garage-worker/security/advisories/new) to report it privately, or email the repository owner via their GitHub profile.

We will acknowledge receipt within a reasonable timeframe and work on a fix before public disclosure when appropriate.

## Deployment security recommendations

This worker exposes a public HTTP endpoint by default. For personal deployments:

1. **Set `API_KEY`** — Protects `GET /devices`, `GET /?json=true`, `POST /simulate`, and `POST /simulate-alert`. The HTML dashboard at `/` stays public. Pass the key via `Authorization: Bearer`, `?key=`, or `x-api-key` on protected routes.
2. **Use Cloudflare Zero Trust / Access** — Restrict the worker URL to authorized identities.
3. **Rotate secrets** — If `API_KEY` or your Cloudflare API token is exposed, rotate them immediately in the Cloudflare dashboard and GitHub repository secrets.
4. **Limit API token scope** — Use a Cloudflare API token scoped only to the Workers and KV resources this project needs.

The worker stores garage door state in Cloudflare KV. It does not store myQ account credentials — state is derived from forwarded notification emails only.
