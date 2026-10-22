// Updates from this app's GitHub releases. On Windows a new version downloads in the background and installs when
// Folio quits, or at once when the person restarts from the notice. The macOS build isn't signed and macOS only
// installs signed updates, so there Folio says a new version is out; the site's download page has it.
import { app } from 'electron';
import electronUpdater, { type UpdateInfo } from 'electron-updater';
import type { Update } from '../shared/bridge';

const { autoUpdater } = electronUpdater;
const EVERY = 6 * 3600_000;

let current: Update | null = null;
let notify: (u: Update) => void = () => {};
export const onUpdate = (fn: typeof notify) => { notify = fn; };
export const update = () => current;

export function startUpdates(){
  if (!app.isPackaged) return;
  const installs = process.platform === 'win32';
  autoUpdater.autoDownload = installs;
  autoUpdater.on(installs ? 'update-downloaded' : 'update-available', (info: UpdateInfo) => { current = { version: info.version, installs }; notify(current); });
  // Offline, or GitHub unreachable: the next check tries again.
  autoUpdater.on('error', () => {});
  const check = () => void autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, EVERY);
}

// Windows, once the open profiles are saved and closed: the installer replaces Folio and starts it again.
export const installUpdate = () => autoUpdater.quitAndInstall(true, true);
