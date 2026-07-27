# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue.

Instead, use [GitHub Security Advisories](https://github.com/andrewtryder/myq-garage-worker/security/advisories/new) to report it privately, or email the repository owner via their GitHub profile.

We will acknowledge receipt within a reasonable timeframe and work on a fix before public disclosure when appropriate.

## Deployment security recommendations

This worker exposes a public HTTP endpoint by default. **Browser access control is the operator’s responsibility** via Cloudflare Zero Trust / Access. The worker does not implement a login page.

1. **Cloudflare Access for the dashboard** — Put the Worker behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/) with an Allow policy for your identity (one-click Workers Access or a self-hosted app). Without Access (or equivalent edge auth), `GET /`, `/admin`, and `/api/*` (including `POST /api/simulate`, `/api/alert-config`, `/api/test-alert`) are reachable by anyone who knows the URL. You may optionally apply a stricter Access policy to `/admin`.
2. **Second Access app to Bypass `/devices` for Home Assistant** — Worker-destination Access apps have no path field; do not add Bypass there. Create a separate self-hosted Access application with a `public` destination of `your-hostname/devices` and a Bypass (Everyone) policy. Cloudflare gives `public` destinations precedence over Worker destinations for that path. See [SETUP.md](SETUP.md) for the API recipe.
3. **`API_KEY` for Home Assistant only** — Required for `GET /devices` and deprecated `GET /?json=true`. Fail closed when unset. Clients must send `Authorization: Bearer` or `x-api-key` (query-string keys are not accepted). After the `/devices` bypass, `API_KEY` is the sole guard on that endpoint — use a strong secret and rotate if exposed. Browser `GET /api/dashboard` does **not** use `API_KEY` (Access only). Do not Bypass `/`.
4. **Inbound email identity** — Envelope MAIL FROM must be exactly `notification@myq.com` (not a substring). Prefer setting `ALLOWED_EMAIL_TO` to your secret Email Routing alias so only that RCPT TO is accepted. When `Authentication-Results` is present, DKIM/DMARC `fail` results are rejected. Message-ID dedup uses hashed pending/completed KV markers (best-effort under KV eventual consistency; use a Durable Object only if strict claim-once is required).
5. **Protect your webhook URL** — Alert settings are stored in KV. Use a secret ntfy topic name or private Apprise endpoint; anyone who knows that URL can send notifications to it directly. The dashboard redacts stored webhook paths in API responses. Alert latching is best-effort: overlapping cron invocations can still double-send because KV is non-atomic.
6. **Dashboard mutation throttles** — `POST /api/alert-config` and `POST /api/test-alert` use a soft KV rate limit (fail-open, shared bucket, non-atomic). Treat it as UX only. For abuse prevention, add Cloudflare Rate Limiting / WAF rules on those routes.
7. **Content Security Policy** — Static assets and JSON responses use a CSP without `'unsafe-inline'` (`script-src 'self'; style-src 'self'`).
8. **Rotate secrets** — If `API_KEY`, `ALLOWED_EMAIL_TO`, or your Cloudflare API token is exposed, rotate them immediately in the Cloudflare dashboard and GitHub repository secrets.
9. **Limit API token scope** — Use a Cloudflare API token scoped only to the Workers, KV, and (if managing Access via API) Access Apps and Policies resources this project needs.

The worker stores garage door state and alert webhook settings in Cloudflare KV. It does not store myQ account credentials — state is derived from forwarded notification emails only.
