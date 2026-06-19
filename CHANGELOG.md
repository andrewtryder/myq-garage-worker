# Changelog

## [1.0.0](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.10...myq-garage-worker-v1.0.0) (2026-06-19)


### ⚠ BREAKING CHANGES

* Alerts KV config and unified API_KEY auth ([#22](https://github.com/andrewtryder/myq-garage-worker/issues/22))
* WEBHOOK_URL and ALERT_OPEN_THRESHOLD_MINUTES env vars are removed; configure alerts in the dashboard Alerts tab (stored in KV). POST /simulate-alert is removed; use POST /alert-config and POST /test-alert. When API_KEY is set, GET / requires authentication (unlock page).

### Features

* Alerts KV config and unified API_KEY auth ([#22](https://github.com/andrewtryder/myq-garage-worker/issues/22)) ([79f683f](https://github.com/andrewtryder/myq-garage-worker/commit/79f683fdacefbc4d9e6fdce67aba739516a1afff))
* improve dashboard UI and add Alert Test tab ([08aea79](https://github.com/andrewtryder/myq-garage-worker/commit/08aea7955871a894b8752980a075ba6c17d83435))
* improve dashboard UI and add Alert Test tab ([6993795](https://github.com/andrewtryder/myq-garage-worker/commit/6993795212db5fe2b4d5ec693829099d974ca5e0))
* redesign Alerts tab with KV config and unified API_KEY auth ([2c547e1](https://github.com/andrewtryder/myq-garage-worker/commit/2c547e1bb4ee904cf2c6a1584e262eeb1560f143))

## [0.1.10](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.9...myq-garage-worker-v0.1.10) (2026-06-18)


### Bug Fixes

* **deploy:** inject GARAGE_DOORS via wrangler.jsonc to avoid shell mangling ([f5ff326](https://github.com/andrewtryder/myq-garage-worker/commit/f5ff3261f03c75bbcf43fbf860fbb46dfa6002c3))

## [0.1.9](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.8...myq-garage-worker-v0.1.9) (2026-06-18)


### Features

* add GET /devices endpoint for Home Assistant integration ([54f7004](https://github.com/andrewtryder/myq-garage-worker/commit/54f7004ba80159fc8c9c020ea2636cd2c95d0228))

## [0.1.8](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.7...myq-garage-worker-v0.1.8) (2026-06-18)


### Features

* improve setup wizard and status page refinements ([5228657](https://github.com/andrewtryder/myq-garage-worker/commit/5228657fecf4a040e40c596d1c294504e389975c))


### Bug Fixes

* **ci:** read GARAGE_DOORS from repository secret ([11d4c76](https://github.com/andrewtryder/myq-garage-worker/commit/11d4c767b70c50a865d462f5815bac4d8cd33185))

## [0.1.7](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.6...myq-garage-worker-v0.1.7) (2026-06-18)

### Features

- add live simulator endpoint and dashboard UI ([b253c25](https://github.com/andrewtryder/myq-garage-worker/commit/b253c2531a5ea2f54ec9db5f6710cb3b2eb83e4f))
- add live simulator endpoint and dashboard UI ([7ad1646](https://github.com/andrewtryder/myq-garage-worker/commit/7ad164620984a0f9956a678b47307b940a17b288))
- state duration tracking and webhook alerts ([407f513](https://github.com/andrewtryder/myq-garage-worker/commit/407f513b187a0e61b9222691bd18f0f411aeb698))
- state duration tracking and webhook alerts ([2f0478d](https://github.com/andrewtryder/myq-garage-worker/commit/2f0478d30f2c54bc18216dc086fbb6c9d46b9c17))
- state duration tracking and webhook alerts ([06ee1d8](https://github.com/andrewtryder/myq-garage-worker/commit/06ee1d820d912192a8438f7bdcf916680a66609c))

## [0.1.6](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.5...myq-garage-worker-v0.1.6) (2026-06-18)

### Features

- add interactive setup wizard for one-click deployment ([9fcd0c6](https://github.com/andrewtryder/myq-garage-worker/commit/9fcd0c6d58d0b85580207b8eea863532c6aed9b6))
- add interactive setup wizard for one-click deployment ([35142d0](https://github.com/andrewtryder/myq-garage-worker/commit/35142d021c5e7104747346286325f18d606aa727))

## [0.1.5](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.4...myq-garage-worker-v0.1.5) (2026-06-17)

### Features

- dynamic garage door mapping using JSON objects ([b07c36d](https://github.com/andrewtryder/myq-garage-worker/commit/b07c36db5fb6dba24d2ece6143e6b518eb7e62c3))
- dynamic garage door parsing and rendering ([0ef3b81](https://github.com/andrewtryder/myq-garage-worker/commit/0ef3b8169125fc3d2921a30c78849179dba9673c))
- implement optional API_KEY dashboard protection ([e74d647](https://github.com/andrewtryder/myq-garage-worker/commit/e74d647154c4bf86be842cda81ae8e8845c238ff))

## [0.1.4](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.3...myq-garage-worker-v0.1.4) (2026-06-07)

### Bug Fixes

- **config:** define GARAGE_LEFT_FEED and GARAGE_RIGHT_FEED variables in wrangler.jsonc ([f358205](https://github.com/andrewtryder/myq-garage-worker/commit/f358205b32ee6f4b1ad4a6b8e2f0d944c7b59d91))

## [0.1.3](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.2...myq-garage-worker-v0.1.3) (2026-06-07)

### Features

- replace Adafruit IO with Cloudflare KV storage and implement state change history timeline ([631ff0b](https://github.com/andrewtryder/myq-garage-worker/commit/631ff0b3c52f29aa58613c99c49247162c16c000))

### Bug Fixes

- **config:** correct Cloudflare KV namespace ID in wrangler.jsonc ([9d20795](https://github.com/andrewtryder/myq-garage-worker/commit/9d20795436d77a7ac682e186158ac837c5d22aa5))

## [0.1.2](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.1...myq-garage-worker-v0.1.2) (2026-06-06)

### Features

- add send-test-email simulation script for local testing ([e1c1e02](https://github.com/andrewtryder/myq-garage-worker/commit/e1c1e02709c717ea796e23324f1f80f0bf20dd7c))
- modularize index.ts and add unit tests ([0e0103e](https://github.com/andrewtryder/myq-garage-worker/commit/0e0103e372183216500f886397ca739ed64dfba4))

### Bug Fixes

- **ci:** fix deploy workflow environment variable expansion in wrangler command ([48559a1](https://github.com/andrewtryder/myq-garage-worker/commit/48559a1751174536caa24380a93230901541a701))

## [0.1.1](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.0...myq-garage-worker-v0.1.1) (2026-06-06)

### Features

- initial commit for myq-garage-worker ([eb2761b](https://github.com/andrewtryder/myq-garage-worker/commit/eb2761b8874225e3b66d4cfb00070c4e83f6d537))
- setup release-please, commitlint, and generate initial changelog ([e0b54d5](https://github.com/andrewtryder/myq-garage-worker/commit/e0b54d5bba5d7894064db0892b5d1052facb1c74))

## 0.1.0 (2026-06-06)

### Features

- initial project structure and code
