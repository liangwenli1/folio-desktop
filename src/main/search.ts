// A profile's search engine, written where each engine reads it before the browser starts (PLAN 6.14).
// Chromium: the profile's own settings file. Firefox (Camoufox): only the engine's own policies file counts, which
// all its profiles share, so Firefox profiles start one at a time and each reads the file written for it.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SEARCH_ENGINES, type SearchEngine } from '../shared/search';

export async function chromiumSearch(dir: string, engine: SearchEngine){
  const file = join(dir, 'Default', 'Preferences');
  const text = await readFile(file, 'utf8').catch(() => '{}');
  let prefs: Record<string, unknown>;
  // A settings file Chromium can't read either is left for Chromium to deal with.
  try { prefs = JSON.parse(text) as Record<string, unknown>; } catch { return; }
  if (engine === 'none') delete prefs.default_search_provider_data;
  else {
    const e = SEARCH_ENGINES[engine];
    prefs.default_search_provider_data = { template_url_data: {
      short_name: e.name, keyword: e.keyword, url: e.url, favicon_url: new URL('/favicon.ico', e.home).href,
      safe_for_autoreplace: false, input_encodings: ['UTF-8'], prepopulate_id: 0, id: '7', sync_guid: `folio-${engine}`
    } };
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(prefs));
}

// The policies file sits next to the program, or in Resources inside the macOS app.
const distribution = (exe: string) => join(dirname(exe), ...(process.platform === 'darwin' ? ['..', 'Resources'] : []), 'distribution');

// Camoufox ships with every engine removed and a stand-in "None"; its file is kept the first time, to start from
// each time and to go back to for 'none'.
async function firefoxSearch(exe: string, engine: SearchEngine){
  const file = join(distribution(exe), 'policies.json'), shipped = join(distribution(exe), 'policies.folio-shipped.json');
  const original = await readFile(shipped, 'utf8').catch(async () => {
    const text = await readFile(file, 'utf8');
    await writeFile(shipped, text);
    return text;
  });
  const policies = JSON.parse(original) as { policies: { SearchEngines?: { Remove?: string[] } & Record<string, unknown> } };
  if (engine !== 'none'){
    const e = SEARCH_ENGINES[engine], se = policies.policies.SearchEngines ?? {};
    policies.policies.SearchEngines = {
      ...se, Remove: [...(se.Remove ?? []).filter(n => n !== e.name), 'None'], Default: e.name,
      Add: [{ Name: e.name, URLTemplate: e.url, Method: 'GET', Alias: e.keyword }]
    };
  }
  await writeFile(file, JSON.stringify(policies, null, 2));
}

let firefoxTurn: Promise<unknown> = Promise.resolve();
// Starts a Firefox profile once the one before it has started (and so read the file). A file that can't be written
// leaves the browser without a search engine rather than unopened.
export function withFirefoxSearch<T>(exe: string, engine: SearchEngine, start: () => Promise<T>): Promise<T> {
  const run = firefoxTurn.then(() => firefoxSearch(exe, engine).catch(e => console.error('setting the search engine failed', e))).then(start);
  firefoxTurn = run.catch(() => {});
  return run;
}
