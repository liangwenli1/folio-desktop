// A profile's search engine, set where each engine takes it from before the browser opens (PLAN 6.14).
// Chromium: through its own settings page, in the engine started without a window, so Chromium records the choice
// itself (on Windows and macOS it signs it, and resets one written into its settings file from outside). Firefox
// (Camoufox): only the engine's own policies file counts, which all its profiles share, so Firefox profiles start one
// at a time and each reads the file written for it.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { BrowserContext } from 'playwright-core';
import { SEARCH_ENGINES, type SearchEngine } from '../shared/search';

// Chromium names engines by keyword; its own "No Search" is the one for 'none'.
const keywordOf = (engine: SearchEngine) => (engine === 'none' ? 'nosearch' : SEARCH_ENGINES[engine].keyword);

type Prefs = { default_search_provider_data?: { template_url_data?: { keyword?: string } }; protection?: { macs?: { default_search_provider_data?: unknown } } };
const readPrefs = (dir: string, file: string) => readFile(join(dir, 'Default', file), 'utf8').then(t => JSON.parse(t) as Prefs, () => null);

// Whether this profile's Chromium has another default than the one chosen. Where Chromium signs the default (Windows,
// macOS) it reads it only from Secure Preferences, whatever Preferences says; elsewhere from Preferences. With none
// recorded it is No Search.
export async function chromiumSearchDue(dir: string, engine: SearchEngine){
  const secure = await readPrefs(dir, 'Secure Preferences');
  const prefs = secure?.protection?.macs?.default_search_provider_data ? secure : await readPrefs(dir, 'Preferences');
  return (prefs?.default_search_provider_data?.template_url_data?.keyword ?? 'nosearch') !== keywordOf(engine);
}

// A call to the settings page's own handler, answered through cr.webUIResponse as its sendWithPromise is (Chromium 150).
const CALL = `(name, ...args) => new Promise((resolve, reject) => {
  const id = 'folio-' + Math.random(), prev = window.cr.webUIResponse;
  window.cr.webUIResponse = (cid, ok, res) => { if (cid !== id) return prev(cid, ok, res); window.cr.webUIResponse = prev; ok ? resolve(res) : reject(new Error(String(res))); };
  chrome.send(name, [id, ...args]);
})`;
type Listed = { id: number; keyword: string; default?: boolean };

// Adds the engine (unless Chromium has it already) and makes it the default, as a person would in its settings.
export async function setChromiumSearch(ctx: BrowserContext, engine: SearchEngine){
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto('chrome://settings/searchEngines');
  const find = async () => {
    const l = await page.evaluate(`(${CALL})('getSearchEnginesList')`) as Record<'defaults' | 'actives' | 'others', Listed[]>;
    return [...l.defaults, ...l.actives, ...l.others].find(e => e.keyword === keywordOf(engine));
  };
  let found = await find();
  if (!found && engine !== 'none'){
    const e = SEARCH_ENGINES[engine];
    // 0 is a new engine; Chromium's settings write the search term as %s.
    await page.evaluate(`chrome.send('searchEngineEditStarted', [0]); chrome.send('searchEngineEditCompleted', ${JSON.stringify([e.name, e.keyword, e.url.replace('{searchTerms}', '%s'), ''])})`);
    found = await find();
  }
  if (found && !found.default){
    await page.evaluate(`chrome.send('setDefaultSearchEngine', [${found.id}, 0, false])`);
    // Answered after the change is made (the handler takes calls in order), so the engine can close.
    await find();
  }
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
