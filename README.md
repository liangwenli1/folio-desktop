# folio-desktop

The Folio workbench: an Electron app where people log in with the account they created on the website and manage their browser profiles. In this release it shows the account's workspaces and plan; profiles, proxies and automation come in the next phases (see `../PLAN.md`).

## Stack

Electron, React, Vite (electron-vite), TypeScript. Kernel integration will use playwright-core 1.62.x for both engines; see `docs/kernel-evaluation.md`.

## How the app talks to the server

The renderer never sees the session token and makes no network requests itself (its CSP allows none). Everything goes through `window.folio`, exposed by the preload (`src/shared/bridge.ts`):

- `src/main/api.ts` calls folio-server with `Authorization: Bearer <token>`, using Electron's network stack so system proxy settings apply.
- `src/main/session.ts` keeps the token encrypted with the OS keychain (safeStorage). Without a keychain, the token stays in memory for the session only.
- The window is sandboxed, cannot navigate, and cannot open windows; links to the website open in the default browser.

## Run locally

```sh
npm install                 # npm 11+ skips install scripts; if out/ has no Electron binary: node node_modules/electron/install.js
FOLIO_API_URL=http://localhost:47110 FOLIO_SITE_URL=http://localhost:47120 npm run dev
```

| Variable | Default | Meaning |
|---|---|---|
| `FOLIO_API_URL` | `http://localhost:47110` | folio-server |
| `FOLIO_SITE_URL` | `http://localhost:47120` | Website, opened for checkout, billing and sign-up |
| `FOLIO_USER_DATA` | Electron default | Separate data directory (tests, multiple instances) |
| `FOLIO_PASSWORD_STORE` | unset | `basic` on Linux without a keyring (tests only) |

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Builds main, preload and renderer into `out/` |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (vitest) |
| `npm run test:e2e` | Drives the built app with Playwright against a folio-server with `DEV_TOOLS=1 MOCK_PAYMENTS=1`. On Linux run under `xvfb-run` |
| `npm run api:types` | Regenerates `src/shared/api-schema.d.ts` from the server's OpenAPI document |
