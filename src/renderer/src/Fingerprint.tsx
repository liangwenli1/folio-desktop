// A profile's fingerprint choices, shared by the profile form and the Fingerprint tab of its details: the identity
// drawn for it (Firefox's screen and GPU shape it, so changing them draws a new device), its CPU cores, the choices
// applied at launch (Chromium's Canvas and GPU, Firefox's WebRTC), and the time zone and language, which follow the
// proxy unless set by hand. Only what the engines were seen to honour is offered (docs/kernel-evaluation.md):
// Chromium's screen follows this computer, and neither engine takes a device memory.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Fingerprint, FingerprintAsk, Geo, KernelKind, Os } from '@shared/bridge';
import { folio, type Profile } from './api';
import { fingerprintFacts, gpuName } from './checks';
import type { Dict } from './i18n';
import { Switch } from './ui';
import { Select, SelectField, type Opt } from './Select';

// Screens a Firefox identity can be drawn to exactly, per system (others come out at another size).
const SCREENS: Record<Os, string[]> = {
  windows: ['1920x1080', '1366x768', '1536x864', '1440x900', '1600x900', '1280x720', '1280x1024', '1680x1050', '1920x1200', '2560x1440', '3840x2160'],
  linux: ['1920x1080', '1366x768', '1536x864', '1440x900', '1280x1024', '1680x1050', '1920x1200', '2560x1440', '3840x2160'],
  macos: ['1440x900', '1512x982', '1728x1117', '1920x1080', '2560x1440']
};
const CORES = [2, 4, 6, 8, 12, 16];
const ZONES = Intl.supportedValuesOf('timeZone');
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const HOST_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

type FpState = { state: 'loading' } | { state: 'ready'; fingerprint: Fingerprint; kernelVersion: string } | { state: 'need-firefox'; version: string } | { state: 'error' };
const ask = (screen: string, gpu: string): FingerprintAsk => ({ screen: screen ? screen.split('x').map(Number) as [number, number] : null, gpu: gpu ? gpu.split('\n') as [string, string] : null });

// `version` is the engine version the identity is drawn for; `installed`, whether Firefox can draw one here.
export function useFingerprint(profile: Profile | undefined, kernel: KernelKind, os: Os, version: string, installed: boolean){
  const fp0 = profile?.fingerprint, ff0 = fp0?.kind === 'firefox' ? fp0.config : null;
  const start = {
    screen: ff0 && typeof ff0['screen.width'] === 'number' ? `${ff0['screen.width']}x${ff0['screen.height']}` : '',
    gpu: ff0 && typeof ff0['webGl:renderer'] === 'string' ? `${ff0['webGl:vendor']}\n${ff0['webGl:renderer']}` : '',
    canvas: fp0?.kind === 'chromium' ? fp0.canvas ?? 'noise' : 'noise', webgl: fp0?.kind === 'chromium' ? fp0.webgl ?? 'spoof' : 'spoof',
    webrtc: fp0?.kind === 'firefox' ? fp0.webrtc ?? 'replace' : 'replace', cores: fp0 ? fingerprintFacts(fp0).cores : null
  };
  const [fp, setFp] = useState<FpState>(profile ? { state: 'ready', fingerprint: profile.fingerprint, kernelVersion: profile.kernelVersion } : { state: 'loading' });
  const [regenerated, setRegenerated] = useState(false);
  // Firefox's screen ('' for random, else 'WxH') and GPU ('' for random, else vendor and renderer on two lines).
  const [screen, setScreen] = useState(start.screen);
  const [gpu, setGpu] = useState(start.gpu);
  const [canvas, setCanvas] = useState<'noise' | 'real'>(start.canvas);
  const [webgl, setWebgl] = useState<'spoof' | 'real'>(start.webgl);
  const [webrtc, setWebrtc] = useState<'replace' | 'block'>(start.webrtc);
  // null keeps the cores the identity was drawn with.
  const [cores, setCores] = useState<number | null>(null);
  const [tzFollow, setTzFollow] = useState(!profile?.timezoneOverride);
  const [tz, setTz] = useState(profile?.timezoneOverride ?? '');
  const [langFollow, setLangFollow] = useState(!profile?.localeOverride);
  const [lang, setLang] = useState(profile?.localeOverride ?? '');
  const [gpus, setGpus] = useState<[string, string][]>([]);
  useEffect(() => { if (kernel === 'firefox') void folio.firefoxGpus(os).then(setGpus); }, [kernel, os]);

  const draw = useCallback(async (s: string, g: string) => {
    if (!version) return false;
    if (kernel === 'firefox' && !installed){ setFp({ state: 'need-firefox', version }); return false; }
    setFp({ state: 'loading' });
    try { setFp({ state: 'ready', ...await folio.newFingerprint(kernel, os, version, ask(s, g)) }); return true; } catch { setFp({ state: 'error' }); return false; }
  }, [kernel, os, version, installed]);
  // A new profile draws again by itself whenever a choice changes; a saved one only when asked.
  const fresh = !profile;
  const generate = useCallback(() => draw(screen, gpu), [draw, screen, gpu]);
  useEffect(() => { if (fresh) void generate(); }, [fresh, generate]);
  const redraw = (s: string, g: string) => void draw(s, g).then(ok => { if (ok) setRegenerated(true); });
  // A saved profile moved to another system draws its identity again for that system.
  const drawnFor = useRef(os);
  useEffect(() => { if (profile && os !== drawnFor.current){ drawnFor.current = os; redraw('', ''); } }, [os]);

  const pickScreen = (v: string) => { setScreen(v); if (profile) redraw(v, gpu); };
  const pickGpu = (v: string) => { setGpu(v); if (profile) redraw(screen, v); };
  // A random identity: Firefox's screen and GPU go back to random too.
  const randomize = () => { setScreen(''); setGpu(''); if (profile) redraw('', ''); else if (!screen && !gpu) void generate(); };
  // Drawing again with the same choices, once the Firefox engine it needed is downloaded.
  const retry = () => (profile ? redraw(screen, gpu) : void generate());
  // A new profile's engine or system changed: Firefox's screen and GPU start over where they no longer fit.
  const refit = (k: KernelKind, o: Os) => { setGpu(''); if (k !== kernel || !SCREENS[o].includes(screen)) setScreen(''); };
  // Back to Folio's defaults for what applies at launch; the identity itself stays.
  const defaults = () => { setCanvas('noise'); setWebgl('spoof'); setWebrtc('replace'); setTzFollow(true); setLangFollow(true); };

  // The fingerprint as it will be saved: the identity drawn, its cores, and the launch choices (defaults left out).
  const value = (): Fingerprint | null => {
    if (fp.state !== 'ready') return null;
    const x = fp.fingerprint;
    return x.kind === 'chromium'
      ? { ...x, hardwareConcurrency: cores ?? x.hardwareConcurrency, canvas: canvas === 'real' ? 'real' : undefined, webgl: webgl === 'real' ? 'real' : undefined }
      : { ...x, config: cores ? { ...x.config, 'navigator.hardwareConcurrency': cores } : x.config, webrtc: webrtc === 'block' ? 'block' : undefined };
  };
  const v = value();
  const facts = v ? fingerprintFacts(v) : null;
  const changed = regenerated || screen !== start.screen || gpu !== start.gpu || canvas !== start.canvas || webgl !== start.webgl || webrtc !== start.webrtc
    || (cores !== null && cores !== start.cores);
  return {
    kernel, os, fp, facts, regenerated, changed, value, randomize, retry, refit, defaults, gpus,
    screen, pickScreen, gpu, pickGpu, canvas, setCanvas, webgl, setWebgl, webrtc, setWebrtc,
    cores: cores ?? facts?.cores ?? null, setCores,
    tzFollow, tz, setTz, followTz: (on: boolean, seen?: string) => { setTzFollow(on); if (!on && !tz) setTz(seen ?? HOST_TZ); },
    langFollow, lang, setLang, followLang: (on: boolean, seen?: string) => { setLangFollow(on); if (!on && !lang) setLang(seen ?? navigator.language); },
    timezoneOverride: tzFollow ? null : tz || null, localeOverride: langFollow ? null : lang.trim() || null,
    langBad: !langFollow && !LANG.test(lang.trim())
  };
}
export type FingerprintDraft = ReturnType<typeof useFingerprint>;

// Each field takes the draft; `geo` is where the profile's proxy exits (null when unchecked or without one).
interface FieldProps { d: Dict; f: FingerprintDraft }
const screenLabel = (v: string) => v.replace('x', ' × ');

export function ScreenField({ d, f }: FieldProps){
  const F = d.fp;
  if (f.kernel === 'chromium') return <SelectField label={F.screen} value="host" onChange={() => {}} disabled options={[{ value: 'host', label: F.screenHost }]} hint={F.screenHostHint} />;
  const screens = [...(f.screen && !SCREENS[f.os].includes(f.screen) ? [f.screen] : []), ...SCREENS[f.os]];
  return <SelectField label={F.screen} value={f.screen} onChange={f.pickScreen}
    options={[{ value: '', label: F.screenRandom }, ...screens.map(v => ({ value: v, label: screenLabel(v) }))]} />;
}

// Chromium shows a random GPU or this computer's; a Firefox identity claims one GPU it has records of.
export function GpuField({ d, f }: FieldProps){
  const F = d.fp;
  if (f.kernel === 'chromium') return <SelectField label={F.webgl} value={f.webgl} onChange={v => f.setWebgl(v as 'spoof' | 'real')} options={(['spoof', 'real'] as const).map(v => ({ value: v, label: F.webglOpts[v] }))} />;
  const opts = [...(f.gpu && !f.gpus.some(([v, r]) => `${v}\n${r}` === f.gpu) ? [f.gpu.split('\n') as [string, string]] : []), ...f.gpus];
  return <SelectField label={F.webgl} value={f.gpu} onChange={f.pickGpu} searchPh={d.form.searchPh}
    options={[{ value: '', label: F.webglOpts.spoof }, ...opts.map(([v, r]) => ({ value: `${v}\n${r}`, label: gpuName(r) }))]} />;
}

export function CanvasField({ d, f }: FieldProps){
  const F = d.fp;
  return f.kernel === 'chromium'
    ? <SelectField label={F.canvas} value={f.canvas} onChange={v => f.setCanvas(v as 'noise' | 'real')} options={(['noise', 'real'] as const).map(v => ({ value: v, label: F.canvasOpts[v] }))} />
    : <SelectField label={F.canvas} value="engine" onChange={() => {}} disabled options={[{ value: 'engine', label: F.canvasOpts.engine }]} />;
}

export function WebrtcField({ d, f }: FieldProps){
  const F = d.fp;
  return f.kernel === 'chromium'
    ? <SelectField label={F.webrtc} value="udp" onChange={() => {}} disabled options={[{ value: 'udp', label: F.webrtcOpts.udp }]} />
    : <SelectField label={F.webrtc} value={f.webrtc} onChange={v => f.setWebrtc(v as 'replace' | 'block')} options={(['replace', 'block'] as const).map(v => ({ value: v, label: F.webrtcOpts[v] }))} />;
}

export function CoresField({ d, f }: FieldProps){
  const shown = f.cores && !CORES.includes(f.cores) ? [f.cores, ...CORES].sort((a, b) => a - b) : CORES;
  return <SelectField label={d.fp.cores} value={f.cores ? String(f.cores) : ''} placeholder="—" disabled={!f.facts} onChange={v => f.setCores(Number(v))}
    options={shown.map(n => ({ value: String(n), label: String(n) }))} />;
}

// The time zone and the language: what the proxy's exit gives, or one set by hand.
export function ZoneField({ d, f, geo, proxied }: FieldProps & { geo: Geo | null; proxied: boolean }){
  const id = useId(), F = d.form;
  const options = useMemo<Opt[]>(() => (f.tz && !ZONES.includes(f.tz) ? [f.tz] : []).concat(ZONES).map(z => ({ value: z, label: z })), [f.tz]);
  return (
    <div className="field">
      <div className="label-row">
        <span className="label" id={id}>{F.tz}</span>
        <Switch label={F.follow} checked={f.tzFollow} onChange={on => f.followTz(on, geo?.timezone)} />
      </div>
      {f.tzFollow
        ? <Followed aria-labelledby={id} value={geo?.timezone ?? (proxied ? F.exitUnknown : d.detail.hostTz)} />
        : <Select labelledBy={id} value={f.tz} onChange={f.setTz} options={options} search searchPh={F.tzPh} />}
    </div>
  );
}

export function LangField({ d, f, geo, proxied, error }: FieldProps & { geo: Geo | null; proxied: boolean; error: string | null }){
  const F = d.form;
  return (
    <div className="field">
      <div className="label-row">
        <label htmlFor="fp-lang">{F.lang}</label>
        <Switch label={F.follow} checked={f.langFollow} onChange={on => f.followLang(on, geo?.locale)} />
      </div>
      {f.langFollow
        ? <Followed id="fp-lang" value={geo?.locale ?? (proxied ? F.exitUnknown : d.detail.hostTz)} />
        : <input id="fp-lang" placeholder={F.langPh} value={f.lang} onChange={e => f.setLang(e.target.value)} aria-invalid={!!error} spellCheck={false} />}
      {error && <p className="err">{error}</p>}
    </div>
  );
}

// What following the proxy comes to, in place of the field.
const Followed = (props: { id?: string; 'aria-labelledby'?: string; value: string }) => <input {...props} className="followed" readOnly tabIndex={-1} />;
