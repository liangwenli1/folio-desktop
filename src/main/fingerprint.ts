// New identities for profiles. What gets stored differs per engine (see docs/kernel-evaluation.md):
// Chromium keeps a seed that drives the engine's fingerprint; Firefox keeps the full Camoufox config,
// because Camoufox draws a new identity on every launch unless it is handed one.
import { randomInt } from 'node:crypto';
import { net } from 'electron';
import { launchOptions } from 'camoufox';
import { ensureModel } from 'camoufox/dist/fpgen/index.js';

import type { Fingerprint, Os } from '../shared/bridge';

// Core counts seen on real desktops, weighted toward the common ones.
const CORES = [4, 6, 8, 8, 8, 12, 12, 16];

// Camoufox draws Firefox identities from a model it downloads on first use (1.5 MB, sha256 pinned by the
// package), and needs it again at every launch. Fetched through Electron so it follows the system proxy.
export const prepareFirefox = () => ensureModel({ fetchImpl: (url, init) => net.fetch(String(url), init) });

export async function generate(kind: 'chromium' | 'firefox', os: Os, firefoxExe: string | null): Promise<Fingerprint> {
  const hardwareConcurrency = CORES[randomInt(CORES.length)];
  if (kind === 'chromium') return { kind, seed: randomInt(1, 2 ** 31 - 1), hardwareConcurrency };
  if (!firefoxExe) throw new Error('kernel_missing');
  await prepareFirefox();
  const opts = await launchOptions({ executable_path: firefoxExe, os, i_know_what_im_doing: true, exclude_addons: ['UBO'] });
  const env = (opts as { env?: Record<string, string> }).env ?? {};
  const blob = Object.entries(env).filter(([k]) => k.startsWith('CAMOU_CONFIG_'))
    .sort(([a], [b]) => Number(a.split('_').pop()) - Number(b.split('_').pop())).map(([, v]) => v).join('');
  const config = JSON.parse(blob) as Record<string, unknown>;
  // Camoufox otherwise leaks the host's core count (P0 evaluation).
  config['navigator.hardwareConcurrency'] = hardwareConcurrency;
  config['audio:seed'] = randomInt(1, 2 ** 31 - 1);
  return { kind, config };
}

// A few readable facts about a Firefox identity, for the profile page.
export function describeFirefox(config: Record<string, unknown>){
  const n = (k: string) => (typeof config[k] === 'number' ? config[k] as number : null);
  return {
    screen: n('screen.width') && n('screen.height') ? `${n('screen.width')} × ${n('screen.height')}` : null,
    gpu: (config['webGl:renderer'] ?? config['webgl:renderer'] ?? null) as string | null,
    platform: (config['navigator.platform'] ?? null) as string | null
  };
}
