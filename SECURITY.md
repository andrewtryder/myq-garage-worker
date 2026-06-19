# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue.

Instead, use [GitHub Security Advisories](https://github.com/andrewtryder/myq-garage-worker/security/advisories/new) to report it privately, or email the repository owner via their GitHub profile.

We will acknowledge receipt within a reasonable timeframe and work on a fix before public disclosure when appropriate.

## Deployment security recommendations

This worker exposes a public HTTP endpoint by default. For personal deployments:

1. **Set `API_KEY`** — When set, protects the dashboard (`GET /`), `GET /devices`, `GET /?json=true`, `POST /simulate`, `POST /alert-config`, and `POST /test-alert`. Unauthenticated visitors to `/` see an unlock page with no door data. Pass the key via `Authorization: Bearer` (Home Assistant), `?key=` (browser bookmark bootstrap), or `x-api-key`.
2. **Protect your webhook URL** — Alert settings are stored in KV. Use a secret ntfy topic name or private Apprise endpoint; anyone who knows that URL can send notifications to it directly, regardless of this worker.
3. **Use Cloudflare Zero Trust / Access** — Optional extra layer to restrict the worker URL to authorized identities.
4. **Rotate secrets** — If `API_KEY` or your Cloudflare API token is exposed, rotate them immediately in the Cloudflare dashboard and GitHub repository secrets.
5. **Limit API token scope** — Use a Cloudflare API token scoped only to the Workers and KV resources this project needs.

The worker stores garage door state and alert webhook settings in Cloudflare KV. It does not store myQ account credentials — state is derived from forwarded notification emails only.
