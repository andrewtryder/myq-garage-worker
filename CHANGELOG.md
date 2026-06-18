# Changelog

## [0.1.5](https://github.com/andrewtryder/myq-garage-worker/compare/myq-garage-worker-v0.1.4...myq-garage-worker-v0.1.5) (2026-06-17)


### Features

* dynamic garage door mapping using JSON objects ([b07c36d](https://github.com/andrewtryder/myq-garage-worker/commit/b07c36db5fb6dba24d2ece6143e6b518eb7e62c3))
* dynamic garage door parsing and rendering ([0ef3b81](https://github.com/andrewtryder/myq-garage-worker/commit/0ef3b8169125fc3d2921a30c78849179dba9673c))
* implement optional API_KEY dashboard protection ([e74d647](https://github.com/andrewtryder/myq-garage-worker/commit/e74d647154c4bf86be842cda81ae8e8845c238ff))

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
