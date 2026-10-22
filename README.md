# folio-desktop

The Folio workbench: an Electron app where people log in with the account they created on the website and manage their browser profiles. Automation, window sync and team features come in later phases (see `../PLAN.md`).

## Stack

Electron, React, Vite (electron-vite), TypeScript. Both browser engines are driven with playwright-core 1.62.x (Camoufox needs < 1.63); see `docs/kernel-evaluation.md`.

## Opening a profile

`src/main/launcher.ts` does it in the main process:

1. `GET /profiles/:id/launch` returns the profile with its proxy and backup line, passwords included (that route and `/proxies/:id/credentials` are refused when the renderer asks).
2. `kernels.ts` finds the engine version the profile was made with. Engines download on demand from their GitHub releases into `<userData>/kernels/<kind>-<version>/` and are checked against the sha256 in the manifest.
3. `proxy-check.ts` sends a request through the proxy to the server's `/net/echo`, which returns the exit IP with its location and time zone. If the line is down, the backup line is tried. The results are reported back to the server.
4. Time zone, language and geolocation come from the profile's overrides, otherwise from the exit.
5. `forwarder.ts` starts a local HTTP proxy that forwards to the upstream (HTTP, HTTPS or SOCKS5, with a password if there is one), because neither engine accepts proxy passwords itself.
6. Chromium (fingerprint-chromium) starts with only Folio's own switches; Firefox (Camoufox) gets the stored config. Camoufox also needs a 1.5 MB model on first use (`fingerprint.ts`).

Live changes from other devices come over SSE (`changes.ts`).

## Workbench screens

The renderer (`src/renderer/src`) has three working pages; the other sidebar entries arrive in later phases.

- **Profiles** (`Profiles.tsx`): summary strip, search, filters, sort, bulk actions (open, stop, move, tag, proxy, Trash with undo), the getting-started steps, and the detail drawer (`ProfileDetail.tsx`) with the passport card and consistency check. `ProfileForm.tsx` creates and edits profiles; `ProfileImport.tsx` imports a spreadsheet (`csv.ts`).
- **Proxies** (`Proxies.tsx`): the proxy library with add, edit, paste import, checks and backup lines.
- **Trash** (`Trash.tsx`): restore (within the plan) and delete forever.

`data.ts` holds the workspace's lists, refetched on change events; `checks.ts` decides each profile's stamp (ISOLATED, REVIEW, OFFLINE) and the fixes it offers. Edits carry the version they started from, so a save over someone else's change is refused once before it replaces it.

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
| `FOLIO_KERNELS_DIR` | `<userData>/kernels` | Where engines live, as `<kind>-<version>/` |
| `CAMOUFOX_FPGEN_DATA` | Camoufox's cache dir | Where the Firefox identity model lives |
| `FOLIO_KERNEL_NO_SANDBOX`, `FOLIO_PROXY_LOOPBACK`, `FOLIO_TEST_HOOKS` | unset | Tests only: engines without a sandbox, proxying for loopback addresses, and exposing running browsers to the test |

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Builds main, preload and renderer into `out/` |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (vitest) |
| `npm run test:e2e` | Drives the built app with Playwright against a folio-server with `DEV_TOOLS=1 MOCK_PAYMENTS=1 DEV_PRIVATE_GEO=seattle` and the Mailpit inbox it sends to (`MAILPIT_URL`, default `http://folio-mailpit:8025`). On Linux run under `xvfb-run`. Tests that open real engines are skipped unless they are unpacked under `FOLIO_KERNELS_DIR`; without internet access, point `CAMOUFOX_FPGEN_DATA` at a copy of the Firefox identity model |
| `npm run api:types` | Regenerates `src/shared/api-schema.d.ts` from the server's OpenAPI document |
