# Public Release Checklist

Use this checklist when preparing or publishing the repository on GitHub.

## Repository settings

- [ ] Set **Description**: e.g. "Cloudflare Worker that parses myQ garage door emails and serves a live status dashboard"
- [ ] Add **Topics**: `cloudflare-workers`, `myq`, `garage-door`, `home-assistant`, `homeassistant`, `typescript`, `cloudflare-d1`
- [ ] Enable **Issues**
- [ ] Optionally enable **Discussions** for community Q&A
- [ ] Confirm the repository visibility is **Public**

## GitHub Actions secrets and variables

In **Settings → Secrets and variables → Actions**:

| Name                    | Type     | Purpose                                  |
| ----------------------- | -------- | ---------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Secret   | Deploy worker via CI                     |
| `CLOUDFLARE_ACCOUNT_ID` | Secret   | Cloudflare account for CI deploys        |
| `API_KEY`               | Secret   | Home Assistant `GET /devices` Bearer key |
| `ALLOWED_EMAIL_TO`      | Secret   | Exact inbound Email Routing recipient    |
| `GARAGE_DOORS`          | Secret   | JSON door name → D1 door id mapping      |
| `D1_DATABASE_ID`        | Variable | D1 database id (injected at deploy time) |

## Release

- [ ] Confirm `release-please` workflow has run and merged the release PR
- [ ] Verify a GitHub Release exists with the correct tag (e.g. `myq-garage-worker-v0.1.8`)
- [ ] Confirm the deployed worker reflects the latest release

## Cross-promotion

- [ ] Link to [ha-myq-garage](https://github.com/andrewtryder/ha-myq-garage) from the README (done in-repo)
- [ ] Link back to this worker repo from the HACS integration README

## Final verification

- [ ] `npm run lint && npm run typecheck && npm test -- --run` pass on `main`
- [ ] `npm run setup` works with a fresh clone (D1 placeholder or inject via `D1_DATABASE_ID`)
- [ ] No personal Cloudflare account IDs, API keys, or unused legacy KV IDs in tracked files
