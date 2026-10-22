# folio-desktop

The Folio workbench: an Electron app where people log in with the account they created on the website and manage their browser profiles. See `../PLAN.md` for what comes next.

## Stack

Electron, React, Vite (electron-vite), TypeScript. Both browser engines are driven with playwright-core 1.62.x (Camoufox needs < 1.63); see `docs/kernel-evaluation.md`.

## Opening a profile

`src/main/launcher.ts` does it in the main process:

1. `POST /profiles/:id/lock` makes this the only computer with the profile open. `GET /profiles/:id/launch` returns the profile with its proxy and backup line, passwords included. These routes, `/proxies/:id/credentials` and the saved-state routes are refused when the renderer asks.
2. `kernels.ts` finds the engine version the profile was made with. Engines download on demand from their GitHub releases into `<userData>/kernels/<kind>-<version>/` and are checked against the sha256 in the manifest.
3. `proxy-check.ts` sends a request through the proxy to the server's `/net/echo`, which returns the exit IP with its location and time zone. If the line is down, the backup line is tried. The results are reported back to the server.
4. Time zone, language and geolocation come from the profile's overrides, otherwise from the exit.
5. `forwarder.ts` starts a local HTTP proxy that forwards to the upstream (HTTP, HTTPS or SOCKS5, with a password if there is one), because neither engine accepts proxy passwords itself.
6. Sign-in state (`sync.ts`): when the server's package is not the one this computer's profile folder already matches, the engine is started offline (no window, a proxy nobody listens on, every page answered locally) to write it into the folder.
7. Chromium (fingerprint-chromium) starts with only Folio's own switches; Firefox (Camoufox) gets the stored config. Camoufox also needs a 1.5 MB model on first use (`fingerprint.ts`).
8. While the browser runs, the lock is renewed every 30 seconds and cookies are uploaded every 5 minutes. Profiles kept on one computer (`syncMode: 'local'`) skip the download and the uploads. Browsers exit with their last window, so when it closes, however it closes, the engine is started offline again to read cookies, local storage and IndexedDB of every site the profile has used, the package is uploaded and the lock released. A profile taken over from another computer closes without uploading.

Live changes from other devices come over SSE (`changes.ts`).

## Workbench screens

The renderer (`src/renderer/src`) has ten working pages; the other sidebar entries arrive in later phases. What a person sees depends on their role: members get their own profiles (and, on Company, their departments'), no proxy library, no Trash, and cannot delete or assign.

- **Profiles** (`Profiles.tsx`): summary strip, search, filters, sort, bulk actions (open, stop, move, tag, proxy, Trash with undo), the getting-started steps, and the detail drawer (`ProfileDetail.tsx`) with the passport card and consistency check. `ProfileForm.tsx` creates and edits profiles; `ProfileImport.tsx` imports a spreadsheet (`csv.ts`).
- **Proxies** (`Proxies.tsx`): the proxy library with add, edit, paste import, checks and backup lines.
- **Extensions** (`Extensions.tsx`): the workspace's extension library. Owners and admins add an extension from a file or its store (the app downloads from the Chrome Web Store or addons.mozilla.org and uploads it; `FOLIO_CHROME_STORE_URL` and `FOLIO_AMO_API` point tests at a local server), upload new versions and delete them. Anyone who can edit a profile installs library extensions in it, in the profile form or the bulk actions. When a profile opens, `src/main/extensions.ts` checks each package against the server's signature and its sha256 (a damaged local copy is fetched again; one that still fails is left out and the person is told), unpacks a copy into the profile's folder with its fixed identity (the library's key in a Chromium manifest; for Firefox the add-on id and a UUID of its own per profile), and the engine loads them. Their data (Chromium's `Local Extension Settings/<id>` and the extension's IndexedDB; Firefox's `storage/default/moz-extension+++<uuid>…`) is read from the folder when the browser closes, saved with the sign-ins and written back on another computer; a Firefox add-on keeps the UUID its data was saved under, pinned in the profile's `prefs.js` before each launch because Firefox's own record there wins over launch settings.
- **Window sync** (`WindowSync.tsx`, and the sync bar and bulk action on the profile list; Studio and Company): `src/main/windowsync.ts` puts a listener in the leader's tabs, in an isolated world the page can't see (Chromium: made through CDP on every page load, since CDP's add-script-to-new-document doesn't run on this engine; Firefox: Camoufox keeps Playwright's scripts and bindings out of the page). Clicks (by element, else by position), mouse moves, scrolling (as a fraction), keys and typed text (including IME text) are replayed with Playwright's mouse and keyboard in the followers' tab at the same position. Addresses opened without a click or key, and tabs opened or closed, are seen in the leader's browser and repeated. Pages under Playwright always report themselves visible, so the tab the leader works in is brought to the front in the followers when something happens in it.
- **Tiling** ("Tile windows" on the Window sync page): `src/main/tile.ts` lays the synced windows out in a grid over the work area of the screen Folio is on, the leader top left. Chromium windows move through CDP (`Browser.setWindowBounds`). Firefox has no such command, so the system moves its window, found through the process with the profile's folder on its command line: on Windows user32 `SetWindowPos` through the PowerShell that ships with Windows (no native module); on macOS System Events, which needs Folio allowed under Accessibility (macOS asks the first time, and also asks to let Folio control System Events). Linux doesn't move Firefox windows. Camoufox sets the fingerprint's window size only at launch; after tiling, pages see the real size. The macOS app's Info.plist carries `NSAppleEventsUsageDescription` for that prompt.
- **Team** (`Team.tsx`): people and roles, invitations (emailed, with a link to copy), removing someone (their profiles go to a chosen person), leaving, and departments on Company. Invitations to the account show in the workspace menu.
- **Flows** (`Flows.tsx`): the team's flows and the step editor (nested steps for conditions and loops, fields checked before saving), with a trial run on one profile: it opens the profile the normal way if needed, runs in a new tab and shows each step's log line as it happens. Steps run in `src/main/flow.ts`, which uses only Playwright's page API, so both engines run them the same way; Camoufox is started with `main_world_eval`, so scripts that start with `mw:` see the page's own JavaScript. Screenshots go to `<userData>/screenshots/`.
- **Scheduled tasks** (`Tasks.tsx`): tasks (a flow, the profiles to run it on, how many at a time, retries, a time limit per profile, and per-profile variables from a spreadsheet), runs started from here, each run's results profile by profile with the step log of every try, rerunning what did not finish, and CSV export. Runs execute in `src/main/runs.ts`: profiles open the normal way (lock, sign-ins, proxy) and close afterwards, saving their sign-ins, unless they were already open; profiles open on another computer are skipped. Results go to the server as each profile finishes. Logging out or quitting stops runs first.
- Schedules (`src/main/schedule.ts`): every 30 seconds, and when the computer wakes, the app checks this computer's scheduled tasks. A time noticed within two minutes runs; older ones (Folio closed, asleep, logged out) are recorded as missed, at most seven, and can be run from their record. While this computer has scheduled tasks, closing the window keeps Folio in the tray (menu bar on macOS), and runs keep the computer awake. On Windows and macOS the account menu can start Folio with the computer, minimized. A sign-in check (`signedIn` step) that finds a profile signed out stops there without retrying and shows a desktop notification that opens the run. `FOLIO_TEST_CLOCK_OFFSET_MS` moves the scheduler's clock in tests.
- **API & scripts** (`Api.tsx`): the local API (`src/main/local-api.ts`), an HTTP server on 127.0.0.1 (port 47210 by default), off until turned on. Scripts send a token made here (kept on this computer as a sha256, tied to the account and workspace) and can list, start and stop profiles and run tasks. A profile started this way gets a debugging address, CDP for Chromium (`--remote-debugging-port` beside Playwright's pipe) and WebDriver BiDi for Firefox; profiles opened by hand never do, and the activity log records openings through the API. Free and Studio allow 60 requests a minute, Company is unthrottled. Tasks skip a Firefox profile a script is driving.
- **Activity log** (`Activity.tsx`): who did what, on which computer, grouped by day and filtered by person or kind; Company exports it as CSV. Each profile's details show its last five entries.
- **Trash** (`Trash.tsx`): restore (within the plan) and delete forever.

Cookie files (`src/shared/cookies.ts`): import reads Cookie-Editor or EditThisCookie JSON, Playwright cookies or storage states, and Netscape cookies.txt; export writes Cookie-Editor JSON or cookies.txt. Exports go through the server (owners and admins, logged); a profile running on this computer saves its cookies first. Imports go into the saved state, and into the browser too when the profile runs here. The spreadsheet import takes a `cookies` column.

Workspace files (`src/main/transfer.ts`): owners and admins export a workspace to a `.folio` file (the server's list plus every saved sign-in state, gzip-compressed, AES-256-GCM with a key made from the passphrase by scrypt) and import one into another workspace from the account menu. The passphrase stays on this computer.

Profile folders live under `<userData>/profiles/<account id>/<profile id>/`. When the account is taken out of a workspace, the server ends its change stream with a `removed` event: running profiles of that workspace close without saving and their folders are deleted. Folders of workspaces the account left while this computer was off are removed the next time a workspace opens.

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
| `FOLIO_API_URL` | the build's address + `/api`, else `http://localhost:47110` | folio-server |
| `FOLIO_SITE_URL` | the build's address, else `http://localhost:47120` | Website, opened for checkout, billing and sign-up |
| `FOLIO_USER_DATA` | Electron default | Separate data directory (tests, multiple instances) |
| `FOLIO_PASSWORD_STORE` | unset | `basic` on Linux without a keyring (tests only) |
| `FOLIO_KERNELS_DIR` | `<userData>/kernels` | Where engines live, as `<kind>-<version>/` |
| `CAMOUFOX_FPGEN_DATA` | Camoufox's cache dir | Where the Firefox identity model lives |
| `FOLIO_KERNEL_NO_SANDBOX`, `FOLIO_PROXY_LOOPBACK`, `FOLIO_TEST_HOOKS` | unset | Tests only: engines without a sandbox, proxying for loopback addresses, and exposing running browsers to the test |

## Packaging and updates

- `electron-builder.yml` makes a Windows NSIS installer (x64, `Folio-Setup-x64.exe`) and a macOS dmg (Apple silicon, `Folio-arm64.dmg`, plus a zip the update check needs), published to this repository's GitHub releases. The release workflow uploads both to a draft and publishes it once both are there, so `latest` never points at a release without installers. The file names carry no version, so the site links to `releases/latest/download/<name>`. A release is made by pushing a tag `v<version>` that matches `version` in package.json; the workflow builds on a Windows and a macOS runner.
- The Folio deployment's address is written in at build time: `MAIN_VITE_FOLIO_URL=https://folio.example.com npm run build` (the site at the root, the API under `/api`). `FOLIO_API_URL` and `FOLIO_SITE_URL` still override it.
- Code signing: none yet. The macOS app is ad-hoc signed (`identity: "-"`, `hardenedRuntime: false`), which Apple silicon needs to run it at all; Gatekeeper asks people to allow it once (System Settings › Privacy & Security › Open Anyway). Windows shows a SmartScreen warning. With a Developer ID certificate, delete those two lines and add the `CSC_LINK` and `CSC_KEY_PASSWORD` secrets, plus a workflow step that writes the App Store Connect key to a file for notarization (`APPLE_API_KEY` is that file's path, with `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`); for Windows, the `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` secrets.
- Updates (`src/main/update.ts`, electron-updater reading this repository's releases; packaged builds only, every 6 hours): Windows downloads a new version in the background and installs it when Folio quits, or at once from the sidebar's "Restart to update", which first saves and closes the open profiles. macOS installs only signed updates, so there the sidebar says a version is out and links to the site's download page.
- The icon is `build/icon.png` (1024 px); electron-builder makes the `.ico` and `.icns` from it.
- Trying the packaged app on Linux (not released): `MAIN_VITE_FOLIO_URL=<address> npm run build && npx electron-builder --linux dir -c.electronDist=node_modules/electron/dist -c.publish.owner=x -c.publish.repo=y --publish never`, then run `release/linux-unpacked/folio-desktop`.

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Builds main, preload and renderer into `out/` |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (vitest) |
| `npm run test:e2e` | Drives the built app with Playwright against a folio-server with `DEV_TOOLS=1 MOCK_PAYMENTS=1 DEV_PRIVATE_GEO=seattle` and the Mailpit inbox it sends to (`MAILPIT_URL`, default `http://folio-mailpit:8025`). On Linux run under `xvfb-run`. Tests that open real engines are skipped unless they are unpacked under `FOLIO_KERNELS_DIR`; without internet access, point `CAMOUFOX_FPGEN_DATA` at a copy of the Firefox identity model |
| `npm run api:types` | Regenerates `src/shared/api-schema.d.ts` from the server's OpenAPI document |
