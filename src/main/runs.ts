// Running flows on profiles. A trial run from the editor opens the profile the normal way when it is not open,
// runs in a new tab and leaves the browser and tab as they are, so the person can look at the result.
import { app } from 'electron';
import { join, relative, isAbsolute } from 'node:path';
import { runFlow } from './flow';
import { isRunning, newPage, open } from './launcher';
import type { FlowEvent, Step } from '../shared/bridge';

export const screenshotsDir = () => join(app.getPath('userData'), 'screenshots');
export const isScreenshot = (path: string) => {
  const rel = relative(screenshotsDir(), path);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
};

export async function tryFlow(profileId: string, steps: Step[], vars: Record<string, string>, signal: AbortSignal, emit: (e: Omit<FlowEvent, 'token'>) => void){
  const failed = (launchError: string) => emit({ done: { ok: false, launchError, data: {}, screenshots: [] } });
  const launchError = isRunning(profileId) ? null : await open(profileId);
  if (launchError) return failed(launchError);
  const tab = await newPage(profileId).catch(() => null);
  if (!tab) return failed('launch_failed');
  const stop = () => { void tab.page.close().catch(() => {}); };
  signal.addEventListener('abort', stop, { once: true });
  const result = await runFlow(tab.page, steps, {
    firefox: tab.kernel === 'firefox', signal, vars, log: log => emit({ log }), shots: { dir: join(screenshotsDir(), 'trial'), prefix: '' }
  });
  signal.removeEventListener('abort', stop);
  emit({ done: result });
}
