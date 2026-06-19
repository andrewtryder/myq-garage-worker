# Public Release Checklist

Use this checklist when preparing or publishing the repository on GitHub.

## Repository settings

- [ ] Set **Description**: e.g. "Cloudflare Worker that parses myQ garage door emails and serves a live status dashboard"
- [ ] Add **Topics**: `cloudflare-workers`, `myq`, `garage-door`, `home-assistant`, `homeassistant`, `typescript`, `cloudflare-kv`
- [ ] Enable **Issues**
- [ ] Optionally enable **Discussions** for community Q&A
- [ ] Confirm the repository visibility is **Public**

## GitHub Actions secrets and variables

In **Settings → Secrets and variables → Actions**:

| Name                    | Type     | Purpose                                   |
| ----------------------- | -------- | ----------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Secret   | Deploy worker via CI                      |
| `CLOUDFLARE_ACCOUNT_ID` | Secret   | Cloudflare account for CI deploys         |
| `API_KEY`               | Secret   | Optional dashboard/API protection         |
| `GARAGE_DOORS`          | Secret   | JSON door name → KV key mapping           |
| `KV_NAMESPACE_ID`       | Variable | KV namespace ID (injected at deploy time) |

## Release

- [ ] Confirm `release-please` workflow has run and merged the release PR
- [ ] Verify a GitHub Release exists with the correct tag (e.g. `myq-garage-worker-v0.1.8`)
- [ ] Confirm the deployed worker reflects the latest release

## Cross-promotion

- [ ] Link to [ha-myq-garage](https://github.com/andrewtryder/ha-myq-garage) from the README (done in-repo)
- [ ] Link back to this worker repo from the HACS integration README

## Final verification

- [ ] `npm run lint && npm run typecheck && npm test -- --run` pass on `main`
- [ ] `npm run setup` works with a fresh clone (KV placeholder in `wrangler.jsonc`)
- [ ] No personal Cloudflare account IDs, KV namespace IDs, or API keys in tracked files
