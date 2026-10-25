// New identities for profiles. What gets stored differs per engine (see docs/kernel-evaluation.md):
// Chromium keeps a seed that drives the engine's fingerprint; Firefox keeps the full Camoufox config,
// because Camoufox draws a new identity on every launch unless it is handed one.
import { randomInt } from 'node:crypto';
import { net } from 'electron';
import { launchOptions } from 'camoufox';
import { ensureModel } from 'camoufox/dist/fpgen/index.js';
import { firefoxGpus } from 'camoufox/dist/webgl.js';

import type { Fingerprint, FingerprintAsk, Os } from '../shared/bridge';

// Core counts seen on real desktops, weighted toward the common ones.
const CORES = [4, 6, 8, 8, 8, 12, 12, 16];

// Camoufox draws Firefox identities from a model it downloads on first use (1.5 MB, sha256 pinned by the
// package), and needs it again at every launch. Fetched through Electron so it follows the system proxy.
export const prepareFirefox = () => ensureModel({ fetchImpl: (url, init) => net.fetch(String(url), init) });

// The GPUs Camoufox has Firefox records of on a system; an identity can only claim one of these.
export async function firefoxGpuList(os: Os){
  await prepareFirefox();
  return firefoxGpus(os === 'windows' ? 'win' : os === 'macos' ? 'mac' : 'lin');
}

export async function generate(kind: 'chromium' | 'firefox', os: Os, firefoxExe: string | null, ask: FingerprintAsk): Promise<Fingerprint> {
  const hardwareConcurrency = CORES[randomInt(CORES.length)];
  if (kind === 'chromium') return { kind, seed: randomInt(1, 2 ** 31 - 1), hardwareConcurrency };
  if (!firefoxExe) throw new Error('kernel_missing');
  await prepareFirefox();
  const [w, h] = ask.screen ?? [];
  const opts = await launchOptions({
    executable_path: firefoxExe, os, i_know_what_im_doing: true, exclude_addons: ['UBO'],
    ...(w && h ? { screen: { minWidth: w, maxWidth: w, minHeight: h, maxHeight: h } } : {}), ...(ask.gpu ? { webgl_config: ask.gpu } : {})
  });
  const env = (opts as { env?: Record<string, string> }).env ?? {};
  const blob = Object.entries(env).filter(([k]) => k.startsWith('CAMOU_CONFIG_'))
    .sort(([a], [b]) => Number(a.split('_').pop()) - Number(b.split('_').pop())).map(([, v]) => v).join('');
  const config = JSON.parse(blob) as Record<string, unknown>;
  // Camoufox otherwise leaks the host's core count (P0 evaluation).
  config['navigator.hardwareConcurrency'] = hardwareConcurrency;
  config['audio:seed'] = randomInt(1, 2 ** 31 - 1);
  return { kind, config };
}
