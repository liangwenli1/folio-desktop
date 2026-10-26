import type { Problem } from './csv';
import type { CheckId } from './checks';
import type { ActivityAction } from './api';
import type { Step } from '@shared/bridge';
import { SEARCH_ENGINES, type SearchEngine } from '@shared/search';

export type Lang = 'en' | 'zh';
type CheckText = { t: (x: CheckVars) => string; d: (x: CheckVars) => string };
// Activity entries: who did it comes first; `p` is the profile ("Shop-07 #0007"), `x` the entry's details.
type Said = (p: string, x: Record<string, any>) => string;
export interface CheckVars { ms: number; host: string; city: string; tz: string; set: string; setLang: string; lang: string; country: string; version: string; latest: string; size: string; kernel: string; real: string }

const profilesN = (n: number) => (n === 1 ? '1 profile' : `${n} profiles`);
const proxiesN = (n: number) => (n === 1 ? '1 proxy' : `${n} proxies`);

const enFields: Record<string, string> = { searchEngine: 'search engine', restoreTabs: 'tab restoring', name: 'name', groupId: 'group', tags: 'tags', proxyId: 'proxy', ownerId: 'owner', departmentId: 'department', kernelVersion: 'engine version', fingerprint: 'fingerprint', os: 'system', timezoneOverride: 'time zone', localeOverride: 'language', notes: 'notes', type: 'type', host: 'host', port: 'port', username: 'username', password: 'password', backupId: 'backup line' };
const zhFields: Record<string, string> = { searchEngine: '搜索引擎', restoreTabs: '恢复标签页', name: '名称', groupId: '分组', tags: '标签', proxyId: '代理', ownerId: '负责人', departmentId: '部门', kernelVersion: '内核版本', fingerprint: '指纹', os: '系统', timezoneOverride: '时区', localeOverride: '语言', notes: '备注', type: '类型', host: '主机', port: '端口', username: '用户名', password: '密码', backupId: '备用线路' };
const enSearch = (id: SearchEngine): string => (id === 'none' ? 'None' : SEARCH_ENGINES[id].name);
const zhSearch = (id: SearchEngine): string => (id === 'none' ? '无' : id === 'baidu' ? '百度' : SEARCH_ENGINES[id].name);

export const en = {
  login: {
    title: 'Log in to Folio', lead: 'Use the account you created on the Folio website.',
    email: 'Email', password: 'Password', submit: 'Log in',
    noAccount: 'No account yet?', create: 'Sign up on the website', forgot: 'Forgot password?',
    // The profiles on the brand panel beside the form: name, exit city.
    demo: [['US-Store-01', 'Seattle'], ['UK-Shop-01', 'London'], ['JP-Social-01', 'Tokyo']] as [string, string][],
    walkthrough: 'Workbench walkthrough: checking proxies, opening a browser profile, restoring tabs, a health check, installing an extension, batch opening, window sync and teamwork.',
    pause: 'Pause walkthrough', play: 'Play walkthrough'
  },
  nav: { profiles: 'Profiles', proxies: 'Proxies', extensions: 'Extensions', flows: 'Flows', sync: 'Window sync', tasks: 'Scheduled tasks', api: 'API & scripts', team: 'Team', activity: 'Activity log', trash: 'Trash', engines: 'Engines' },
  groups: {
    title: 'Groups', all: 'All groups', none: 'No group', add: 'New group', namePh: 'Group name', more: (g: string) => `More for ${g}`,
    rename: 'Rename', delete: 'Delete', deleteConfirm: (g: string) => `Delete “${g}”? Its profiles stay, without a group.`,
    color: 'Colour', colors: { red: 'Red', blue: 'Blue', green: 'Green', amber: 'Amber', purple: 'Purple', teal: 'Teal', gray: 'Grey' }
  },
  plans: { free: 'Free', studio: 'Studio', company: 'Company' },
  periods: { monthly: 'monthly', yearly: 'yearly' },
  roles: { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' },
  ws: { switch: 'Switch workspace', current: 'Current workspace' },
  plan: {
    usage: (used: number, limit: number) => `${used} of ${limit} profiles`,
    renews: (date: string, period: string) => `Renews ${date}, ${period}`,
    ends: (date: string) => `Ends ${date}`,
    trialEnds: (date: string) => `Free trial ends ${date}`,
    scheduled: (plan: string, date: string) => `Becomes ${plan} on ${date}`,
    upgrade: 'Upgrade', addProfiles: 'Add profiles', manage: 'Billing'
  },
  user: {
    account: 'Account', manage: 'Manage account', teams: 'Teams', settings: 'Settings', data: 'Data', language: 'Language',
    exportAll: 'Export all data…', importAll: 'Import data…', logout: 'Log out',
    startup: 'Start with this computer', startupHint: 'Opens minimized in the tray, so scheduled tasks run on time.'
  },
  tray: { open: 'Open Folio', quit: 'Quit Folio', background: 'Folio keeps running in the background so scheduled tasks run on time. Quit it from the tray icon.' },
  notify: { signedOut: (task: string, names: string[]) => ({ title: names.length === 1 ? `${names[0]} is signed out` : `${names.length} profiles are signed out`, body: `${task}: ${names.join(', ')}` }) },
  update: {
    ready: (v: string) => `Folio ${v} is ready to install.`, restart: 'Restart to update', restartNote: 'Open profiles are saved and closed first. Or it installs the next time you quit.',
    out: (v: string) => `Folio ${v} is out.`, download: 'Download'
  },
  common: {
    cancel: 'Cancel', save: 'Save', close: 'Close', undo: 'Undo', check: 'Check', checking: 'Checking…', edit: 'Edit', copy: 'Copy', copied: 'Copied',
    selected: (n: number) => `${n} selected`, clearSelection: 'Clear selection', selectAll: 'Select all shown', select: (x: string) => `Select ${x}`,
    never: 'Never', justNow: 'Just now', minAgo: (n: number) => `${n} min ago`, hAgo: (n: number) => `${n} h ago`, yesterday: 'Yesterday', daysAgo: (n: number) => `${n} days ago`,
    loadFailed: 'This list could not be loaded.', loadRetry: 'Try again',
    attribution: 'IP Geolocation by DB-IP'
  },
  os: { windows: 'Windows', macos: 'macOS', linux: 'Linux' },
  profiles: {
    title: 'Profiles', count: profilesN,
    search: 'Search profiles', searchPh: 'Search name, number, city or tag', new: 'New profile', import: 'Import',
    sum: {
      running: 'Running', proxy: 'Proxy problems', proxyOk: 'All proxies answering',
      proxyNote: (down: number, slow: number) => [down && `${down} not answering`, slow && `${slow} slow`].filter(Boolean).join(' · '),
      risks: 'Link risks', risksOk: 'Nothing links your profiles'
    },
    views: { label: 'View', list: 'List', cards: 'Cards' },
    filter: { label: 'Status', all: 'All', states: 'All statuses', running: 'Running', stopped: 'Not running', issues: 'Needs attention', starred: 'Favourites', engine: 'Engine', engines: 'All engines' },
    star: 'Add to favourites', unstar: 'Remove from favourites', move: 'Move to group', moveTitle: (n: string) => `Move “${n}” to a group`,
    sort: 'Sort', sorts: { recent: 'Recently opened', name: 'Name A–Z', latency: 'Proxy latency' },
    cols: { profile: 'Profile', group: 'Group', fingerprint: 'Fingerprint', proxy: 'Proxy', last: 'Last opened', member: 'Assigned to', status: 'Status', actions: 'Actions' },
    open: 'Open', stop: 'Stop', actionsX: (n: string) => `Actions for ${n}`, starting: 'Starting…', inUse: 'In use now',
    st: { idle: 'Not running', running: 'Running', proxyDown: 'Proxy down' }, checkProxy: 'Check proxy',
    stage: { proxy: 'Checking the proxy…', restore: 'Restoring sign-ins…', launch: 'Starting the browser…' }, stages: ['Engine', 'Proxy', 'Sign-ins', 'Browser'],
    map: {
      label: 'Where the profiles’ proxies exit',
      check: 'Check all proxies', add: 'Add a proxy'
    },
    palette: 'Search everything',
    restoring: 'Restoring sign-ins…', saving: 'Saving sign-ins…', inUseOn: (where: string) => `In use on ${where}`,
    downloading: (pct: number) => `Downloading engine… ${pct}%`,
    noProxy: 'No proxy', unchecked: 'Not checked', noResponse: 'No response', ms: (n: number) => `${n} ms`, mismatch: '! Doesn’t match its proxy',
    unassigned: 'Unassigned',
    emptyNone: 'No profiles yet.', emptyMatch: 'No profiles match.', emptyFor: (q: string) => `Nothing found for “${q}”.`,
    emptyHint: (n: number) => `Try another search, or clear the filters to see all ${n}.`, clearFilters: 'Clear filters',
    bulk: {
      open: 'Open', stop: 'Stop', move: 'Move to group…', proxy: 'Set proxy…', assign: 'Assign to…',
      tag: 'Tag', tagPh: 'Tag name', addTag: 'Add tag', removeTag: 'Remove tag', trash: 'Delete', cookies: 'Export cookies…',
      extensions: 'Extensions…', install: 'Install', uninstall: 'Uninstall', sync: 'Sync windows', syncTwo: 'Select at least two profiles',
      confirm: (n: number) => `Move ${profilesN(n)} to Trash?`, confirmNote: 'Running ones are stopped first. You can undo this.', doTrash: 'Move to Trash'
    },
    done: {
      trashed: (n: number) => `${profilesN(n)} moved to Trash`, moved: (n: number, g: string) => `${profilesN(n)} moved to ${g}`,
      tagged: (n: number, t: string) => `Tagged ${profilesN(n)} “${t}”`, untagged: (n: number, t: string) => `Removed “${t}” from ${profilesN(n)}`,
      proxySet: (n: number) => `Proxy changed on ${profilesN(n)}`, assigned: (n: number, who: string) => `${profilesN(n)} assigned to ${who}`,
      created: (x: string) => `${x} is ready`, saved: 'Saved', failed: (name: string, why: string) => `${name}: ${why}`,
      stale: 'Someone changed this profile in the meantime. Try again.',
      extAdded: (n: number, x: string, skipped: number) => `${x} installed in ${profilesN(n)}${skipped ? `; ${skipped} skipped (other engine, or already there)` : ''}`,
      extRemoved: (n: number, x: string) => `${x} uninstalled from ${profilesN(n)}`,
      syncing: (leader: string, n: number) => `Window sync started: ${leader} leads, ${n === 1 ? '1 window follows' : `${n} windows follow`}`, syncFailed: 'Window sync needs at least two open profiles.'
    }
  },
  launch: {
    kernel_missing: 'This engine isn’t downloaded on this computer.', proxy_down: 'The proxy didn’t answer, and there’s no working backup line.',
    in_trash: 'This profile is in the Trash.', not_found: 'This profile no longer exists.', launch_failed: 'The browser didn’t start. Try again.',
    download_failed: 'The engine download failed. Check the connection and try again.',
    locked: 'This profile is open on another computer.',
    lock_lost: 'Someone took this profile over on another computer, so it was closed here.',
    save_failed: 'The browser closed, but its sign-ins couldn’t be saved to Folio. They are still on this computer.'
  } as Record<string, string>,
  detail: {
    profile: 'Profile', close: 'Close details', basics: 'Basics', proxyCard: 'Proxy connection', dataCard: 'Profile data', manage: 'Manage',
    viewAll: 'View all', lastOpened: 'Last opened', synced: 'Last saved', answered: (ms: number) => `Answering · ${ms} ms`,
    openProfile: 'Open profile', edit: 'Edit', trash: 'Move to Trash',
    notChecked: 'Exit not checked yet', noExit: 'Proxy not answering', direct: 'Direct connection',
    tabs: { overview: 'Overview', signins: 'Sign-ins', extensions: 'Extensions', activity: 'Activity' }, more: 'More actions', fingerprint: 'Fingerprint',
    verdict: { ok: 'All consistent', warn: 'Needs a look', bad: 'Can’t open' }, noExtensions: 'No extensions in this profile.', noActivity: 'Nothing recorded yet.',
    fields: { lang: 'Language', tz: 'Time zone', os: 'OS', engine: 'Engine', seed: 'Fingerprint seed', cores: 'CPU cores' },
    hostTz: 'This computer’s',
    checksTitle: 'Consistency check', notes: 'Notes', status: { ok: 'Passed', todo: 'To do', warn: 'Warning', bad: 'Problem' },
    storage: 'Sign-ins', cookies: 'Cookies', siteData: 'Site storage', sites: 'Sites', extensions: 'Extensions', savedOn: (when: string, device: string | null) => `Saved ${when}${device ? ` on ${device}` : ''}`,
    notSaved: 'Nothing saved yet. Sign-ins are saved when the browser closes.', localOnly: 'Kept on the computer that uses it; Folio holds no copy.',
    exportAs: (format: string) => `Export ${format}`, importCookies: 'Import cookies', json: 'JSON', netscape: 'cookies.txt',
    exported: (n: number, path: string) => `${profilesN(n)} exported to ${path}`, imported: (n: number) => `${n} ${n === 1 ? 'cookie' : 'cookies'} imported`,
    exportFailed: (name: string, why: string) => `${name}: ${why}`,
    inUse: 'In use elsewhere', away: (device: string, email: string, since: string) => `Open on ${device} (${email}) since ${since}.`,
    takeover: 'Take over', takeoverNote: 'Their browser closes. Changes made there in the last few minutes are lost.', takeoverDo: 'Take over and open'
  },
  // Opening a profile, step by step.
  opening: {
    title: 'Opening', of: (i: number, n: number) => `${i} / ${n}`,
    steps: { engine: 'Preparing the engine', proxy: 'Checking the proxy', restore: 'Restoring sign-ins', browser: 'Opening the browser' },
    engineReady: (name: string) => `${name} · downloaded`, engineGet: (done: string, total: string) => `Downloading ${done} of ${total}`,
    checking: 'Finding where it exits…', exit: (place: string, ms: number) => `Exits in ${place} · ${ms} ms`, direct: 'No proxy: this computer’s IP',
    signins: (c: number, o: number) => `${c} ${c === 1 ? 'cookie' : 'cookies'} · ${o} ${o === 1 ? 'site' : 'sites'}`, fresh: 'Nothing saved yet', local: 'Kept on its own computer',
    starting: 'Starting the browser…', waiting: 'After the steps above'
  },
  // Opening several profiles at once.
  batchOpen: {
    title: (n: number) => `Opening ${profilesN(n)}`, done: (k: number, n: number) => `${k} of ${n} done`,
    opened: 'Opened', waiting: 'Waiting', retry: 'Retry', fold: 'Fold', unfold: 'Show', close: 'Close'
  },
  checks: {
    'proxy-ok': { t: x => `Proxy answering · ${x.ms} ms`, d: x => x.host },
    'proxy-slow': { t: x => `Proxy is slow · ${x.ms} ms`, d: x => `${x.host}. Pages may time out.` },
    'proxy-down': { t: () => 'Proxy didn’t respond', d: x => `${x.host}. The profile can’t open until it answers.` },
    'proxy-backup': { t: () => 'Main line didn’t respond; the backup line takes over', d: x => x.host },
    'proxy-none': { t: () => 'No proxy', d: () => 'Sites see this computer’s IP address.' },
    'proxy-unchecked': { t: () => 'Proxy not checked yet', d: x => `${x.host}. Check it to see where it exits.` },
    'tz-ok': { t: () => 'Time zone matches the exit IP', d: x => x.tz },
    'tz-host': { t: () => 'Time zone follows this computer', d: () => 'Without a proxy, sites see this computer’s location anyway.' },
    'tz-pending': { t: () => 'Exit not checked; the time zone follows this computer for now', d: () => 'Check the proxy so the time zone and language follow where it exits.' },
    'tz-mismatch': { t: () => 'Time zone doesn’t match the exit IP', d: x => `Set by hand to ${x.set}, but the proxy exits in ${x.city}, which is on ${x.tz}.` },
    'lang-ok': { t: () => 'Language matches the region', d: x => x.lang },
    'lang-mismatch': { t: () => 'Language doesn’t match the exit IP', d: x => `Set by hand to ${x.setLang}, but the proxy exits in ${x.country}.` },
    geo: { t: x => `Geolocation set near ${x.city}`, d: () => 'Accuracy about 50 m' },
    rtc: { t: () => 'WebRTC shows the proxy IP only', d: () => 'The real IP of this computer stays hidden' },
    'rtc-off': { t: () => 'WebRTC is off', d: () => 'Sites that need calls or video don’t work in this profile.' },
    'fp-real': { t: x => `${x.real} show this computer’s own values`, d: () => 'Profiles on the same computer can be linked by them.' },
    'engine-ok': { t: x => `${x.kernel} ${x.version}`, d: () => 'The recommended version' },
    'engine-older': { t: x => `${x.kernel} ${x.version}`, d: x => `${x.latest} is recommended. The fingerprint stays the same when you upgrade.` },
    'engine-missing': { t: x => `${x.kernel} ${x.version} isn’t downloaded yet`, d: x => `${x.size}, once for all profiles. It downloads when you open the profile.` },
    'engine-unavailable': { t: x => `${x.kernel} ${x.version} isn’t built for this computer’s system`, d: x => `Use ${x.latest} for this profile to open it here.` }
  } satisfies Record<CheckId, CheckText>,
  fixes: { check: 'Check again', backup: 'Make the backup the main line', 'choose-proxy': 'Choose a proxy', 'follow-tz': 'Follow the proxy', 'follow-lang': 'Follow the proxy', download: 'Download', use: (v: string) => `Use ${v}`, edit: 'Change settings' },
  // A profile's fingerprint choices, in the profile form and its details.
  fp: {
    title: 'Fingerprint', random: 'Random fingerprint',
    screen: 'Screen resolution', screenRandom: 'Random for the system', screenHost: 'This computer’s screen',
    webrtc: 'WebRTC', webrtcOpts: { udp: 'Block non-proxied UDP', replace: 'Show the proxy IP', block: 'Off' },
    webgl: 'WebGL', webglOpts: { spoof: 'Random GPU', real: 'This computer’s GPU' },
    canvas: 'Canvas', canvasOpts: { noise: 'Noise', real: 'This computer’s', engine: 'Set by the engine' }
  },
  form: {
    newTitle: 'New profile', editTitle: 'Edit profile', name: 'Name', defaultName: (n: number) => `Profile ${n}`, nameErr: 'Give it a name.',
    basic: 'Basics', engineProxy: 'Engine and proxy', more: 'More settings', preview: 'Preview',
    group: 'Group', noGroup: 'No group', newGroup: 'New group…', newGroupPh: 'Name of the new group',
    engine: 'Engine', os: 'Operating system',
    proxy: 'Proxy', proxyMode: { saved: 'Saved proxy', custom: 'New proxy', none: 'No proxy' }, pickProxy: 'Choose a proxy',
    pickErr: 'Choose a proxy, or pick No proxy.', pastePh: 'socks5://user:pass@host:port',
    proxyBad: 'That doesn’t look like a proxy address.',
    proxyOk: (place: string, ms: number) => `Connected · ${place} · ${ms} ms`, proxyDown: 'Can’t connect',
    tags: 'Tags', tagsPh: 'Comma-separated', fp: 'Fingerprint',
    regenWarn: 'Sites will see a new device; logged-in sites may ask you to verify again.', fpErr: 'Couldn’t make a fingerprint.',
    firefoxMissing: 'Download the Firefox engine to make this fingerprint.', download: 'Download', downloading: (pct: number) => `Downloading… ${pct}%`,
    create: 'Create profile', save: 'Save changes', tz: 'Time zone', lang: 'Language', follow: 'Follow the proxy', custom: 'Set by hand',
    tzPh: 'Search time zones, e.g. Berlin', langPh: 'de-DE', tzNone: 'No time zone matches.', langErr: 'Use a language tag like de-DE.', searchPh: 'Search…',
    notes: 'Notes', engineVersion: 'Engine version', owner: 'Assigned to',
    extensions: 'Extensions', noExtensions: (engine: string) => `The library has no ${engine} extensions yet.`,
    sync: 'Sign-ins', syncCloud: 'Save to Folio and follow the profile', syncLocal: 'Keep on the computer that uses it',
    syncHelp: 'Kept on one computer, sign-ins never leave it, and the profile opens signed out anywhere else.',
    stale: 'Someone changed this profile while you were editing. Save again to replace their changes, or cancel to keep them.'
  },
  // A profile's search engine and the pages it opens with.
  browser: {
    title: 'Browser', search: 'Search engine', name: enSearch,
    restore: 'Restore last tabs',
    start: 'On opening', startTabs: 'Restores the last tabs', startHome: (name: string) => `Opens the ${name} home page`, startBlank: 'Opens a blank page',
    bulk: 'Browser…', on: 'On', off: 'Off',
    searchSet: (n: number, name: string) => `Search engine set to ${name} on ${profilesN(n)}`,
    tabsSet: (n: number, on: boolean) => `Restoring tabs turned ${on ? 'on' : 'off'} on ${profilesN(n)}`
  },
  importer: {
    title: 'Import profiles', lead: 'One profile per row with a header row. Save Excel sheets as CSV first; up to 500 rows at a time.',
    columns: 'Columns: name (required), group, tags (separated by |), os (windows, macos, linux), engine (chromium, firefox), proxy, timezone, language, search engine (google, bing, baidu, duckduckgo, yahoo, yandex or none), restore tabs (yes or no), notes, cookies (JSON or cookies.txt text).',
    example: 'Insert an example', file: 'Choose a file…', pasteLabel: 'CSV', ready: (n: number) => `${profilesN(n)} ready to import.`,
    problems: 'Fix these rows first:', row: (n: number) => `Row ${n}`, header: 'The first row needs a “name” column.',
    errs: { name: 'the name is missing or too long', os: 'unknown system', engine: 'unknown engine', tags: 'up to 10 tags of 24 characters', timezone: 'unknown time zone', language: 'not a language tag', proxy: 'the proxy can’t be read', cookies: 'no cookies could be read', search: 'unknown search engine', restoreTabs: 'use yes or no', header: '' } satisfies Record<Problem | 'proxy', string>,
    tooMany: 'Up to 500 rows at a time.', room: (free: number) => `The plan has room for ${profilesN(free)} more.`, firefox: 'Some rows use Firefox: download its engine first.',
    submit: (n: number) => `Import ${profilesN(n)}`, steps: { proxies: 'Adding proxies…', groups: 'Creating groups…', fingerprints: (i: number, n: number) => `Making fingerprints… ${i} / ${n}`, saving: 'Saving…', cookies: (i: number, n: number) => `Importing cookies… ${i} / ${n}` },
    done: (n: number) => `${profilesN(n)} imported`
  },
  proxies: {
    title: 'Proxies',
    search: 'Search proxies', searchPh: 'Search name, host or city', add: 'Add proxy', import: 'Import', checkAll: 'Check all',
    sum: { total: 'Proxies', ok: 'Answering', issues: 'Problems', unbound: 'Unused' },
    filter: { type: 'Type', types: 'All types', region: 'Region', regions: 'All regions', state: 'Status', states: 'All statuses' },
    cols: { name: 'Name', type: 'Type', address: 'Address', exit: 'Exit', status: 'Status', latency: 'Latency', profiles: 'Profiles', actions: 'Actions' },
    labels: { latency: 'Latency', uptime: 'Uptime', profiles: 'Profiles' }, backupOf: (n: string) => `backup ${n}`, noExit: 'Exit unknown',
    downNote: (n: number, when: string | null) => `${n === 1 ? 'No response the last time' : `No response the last ${n} times`}${when ? ` · last answered ${when}` : ''}`,
    states: { ok: 'Answering', slow: 'Slow', down: 'Not answering', unchecked: 'Not checked', issues: 'Slow or not answering', unbound: 'Unused' },
    history: (n: number) => `Last ${n} ${n === 1 ? 'check' : 'checks'}`, never: 'Not checked',
    empty: 'No proxies yet. Add one, or import a list from your provider.',
    bulkCheck: 'Check', bulkDelete: 'Delete', confirmDelete: (n: number) => `Delete ${proxiesN(n)}?`, confirmNote: 'Profiles that use them keep working without a proxy.',
    deleted: (n: number) => `${proxiesN(n)} deleted`, checked: (n: number) => `Checked ${proxiesN(n)}`, actionsX: (n: string) => `Actions for ${n}`,
    detail: {
      label: 'Proxy', exitIp: 'Exit IP', region: 'Region', latency: 'Latency', profiles: 'Profiles', config: 'Connection', history: 'Recent checks',
      ok: (ms: number) => `Answered · ${ms} ms`, failed: 'No response', passSet: 'Saved', passNone: 'None', uptime: 'Uptime',
      uptimeOf: (pct: number, n: number) => `${pct}% of the last ${n}`, bound: (n: number) => `Profiles (${n})`, showAll: 'Show in Profiles',
      none: 'No profile uses it.', noHistory: 'Not checked yet.'
    },
    formAdd: 'Add proxy', formEdit: 'Edit proxy', name: 'Name', namePh: 'Defaults to host:port', type: 'Type', host: 'Host', port: 'Port',
    auth: 'Authentication', user: 'Username', pass: 'Password', passKeep: 'Saved. Leave empty to keep it.', reveal: 'Show', conceal: 'Hide',
    test: 'Test connection', testOk: 'Connected', testBad: 'Can’t connect', why: { timeout: 'Timed out', unreachable: 'Unreachable' } as Record<string, string>,
    addMore: 'Add another after saving',
    backup: 'Backup line', backupNone: 'None', backupHint: 'Used automatically when this line doesn’t answer.',
    hostErr: 'Enter a host name or IP address.', portErr: 'Ports go from 1 to 65535.',
    importTitle: 'Import proxies', importLead: 'One per line, in any of these formats:', defaultType: 'Type for lines without one',
    importBtn: 'Import', imported: (added: number, known: number) => `${proxiesN(added)} added${known ? `, ${known} already saved` : ''}`,
    badLines: 'These lines couldn’t be read:', line: (n: number) => `Line ${n}`
  },
  trash: {
    title: 'Trash', empty: 'The Trash is empty.',
    restore: 'Restore', restoreAll: 'Restore all', purge: 'Delete forever', purgeAll: 'Empty Trash',
    cols: { profile: 'Profile', fingerprint: 'Fingerprint', signins: 'Sign-ins', deleted: 'Deleted', by: 'Deleted by' },
    sites: (n: number) => (n ? `${n} ${n === 1 ? 'site' : 'sites'}` : 'None'), byAt: (who: string, when: string) => `${who} deleted it ${when}`,
    confirmPurge: (n: number) => `Delete ${profilesN(n)} forever?`, confirmNote: 'Their fingerprints and settings can’t be recovered.',
    restored: (n: number) => `${profilesN(n)} restored`, purged: (n: number) => `${profilesN(n)} deleted forever`
  },
  engines: {
    title: 'Engines',
    cols: { version: 'Version', platforms: 'Systems', size: 'Size', released: 'Released', profiles: 'Profiles', status: 'Status', actions: 'Actions' },
    recommended: 'Recommended', installed: 'Downloaded', notDownloaded: 'Not downloaded', download: (size: string) => `Download · ${size}`, failed: 'Download failed',
    downloadingPct: (pct: number) => `Downloading ${pct}%`, everywhere: (n: number) => `${n} in all workspaces`, actionsX: (v: string) => `Actions for ${v}`,
    remove: 'Delete from this computer', removeBusy: 'Close the profiles that use it first.', removed: (v: string) => `${v} deleted from this computer`,
    retired: 'No longer in the catalog', none: 'No version of this engine is built for this computer.',
    outdated: (n: number, kernel: string) => `${profilesN(n)} use the older ${kernel}`, upgrade: (v: string) => `Upgrade to ${v}`,
    upgradeNote: (v: string) => `After the upgrade to ${v}, sites see the same fingerprint as before.`,
    paused: (pct: number) => `Paused at ${pct}%`, pause: 'Pause', resume: 'Resume',
    disk: (size: string) => `Engines on this computer take ${size}`, cleanup: 'Delete unused versions', nothingToClean: 'Every downloaded version is in use or recommended.',
    cleanupTitle: (n: number) => `Delete ${n === 1 ? '1 unused version' : `${n} unused versions`}?`, cleanupNote: (size: string) => `Frees ${size}. A version downloads again if a profile needs it.`,
    cleaned: (n: number) => `${n === 1 ? '1 version' : `${n} versions`} deleted from this computer`,
    settings: 'Download settings', autoDownload: 'Download the recommended version automatically',
    idleOnly: 'Download only while idle',
    upgraded: (n: number, v: string) => `${profilesN(n)} now use ${v}`,
    platforms: { 'win32-x64': 'Windows', 'darwin-arm64': 'macOS · Apple silicon', 'darwin-x64': 'macOS · Intel', 'linux-x64': 'Linux' } as Record<string, string>,
    admin: {
      upload: 'Upload a version', title: 'Upload an engine version', kind: 'Engine', version: 'Version', versionPh: 'e.g. 151.0.7900.10', platform: 'System',
      file: 'Package', choose: 'Choose a file…', fileHint: 'The package as the engine publishes it: .zip, .tar.xz or .dmg. It goes straight to Folio’s storage.',
      hashing: (pct: number) => `Checking the file… ${pct}%`, uploading: (pct: number) => `Uploading… ${pct}%`, send: 'Upload', done: (v: string) => `${v} added to the catalog`,
      recommend: 'Make recommended', recommended: (v: string) => `${v} is now recommended`, retire: 'Remove', unfinished: 'Upload unfinished',
      recommendTitle: (v: string) => `Make ${v} the recommended version?`, recommendNote: 'New profiles get it, and the note below shows on its row.', note: 'What changed (optional)',
      retireTitle: (v: string) => `Remove ${v} from the catalog?`,
      retireConfirm: (n: number) => `${n ? `${profilesN(n)} use it. ` : ''}Computers that downloaded it keep it; elsewhere its profiles are offered another version.`,
      retiredDone: (v: string) => `${v} removed from the catalog`
    }
  },
  team: {
    title: 'Team',
    invite: 'Invite people', you: 'you', remove: 'Remove from team', leave: 'Leave team',
    tabs: { members: 'Members', groups: 'Group access' },
    cols: { person: 'Person', role: 'Role', scope: 'Can see', status: 'Status' },
    scopeAll: 'All profiles', scopeOwn: 'Profiles assigned to them', joined: 'Joined', invited: 'Invited',
    search: 'Search people', meTag: '(you)', moreX: (e: string) => `More for ${e}`, roleOf: (e: string) => `Role of ${e}`,
    groupSum: (people: number, n: number) => `${people === 1 ? '1 person' : `${people} people`} · ${profilesN(n)}`,
    copiedNew: 'A new invitation link was copied; the earlier one no longer works.',
    roleHelp: { admin: 'Sees and manages every profile, proxy and person.', member: 'Sees and opens the profiles assigned to them; can create and edit, not delete.', viewer: 'Sees what they are given; changes nothing.' } as Record<string, string>,
    roleActions: (n: number) => `${n} ${n === 1 ? 'action' : 'actions'}`,
    expires: (date: string) => `Expires ${date}`,
    copyLink: 'Copy link', copied: 'Invitation link copied', resend: 'Send again', withdraw: 'Withdraw', withdrawn: 'Invitation withdrawn',
    inviteTitle: 'Invite to the team', email: 'Email', emailErr: 'Enter an email address.', role: 'Role',
    send: 'Send invitation', sent: (e: string) => `Invitation sent to ${e}.`, notSent: 'The email couldn’t be sent. Copy the link and pass it on yourself.',
    link: 'Invitation link', done: 'Done',
    removeTitle: (e: string) => `Remove ${e}`, removeLead: 'Their profiles go to the person you choose. Anything they have open closes on their computer, and their copies there are deleted.',
    heir: 'Give their profiles to', removeDo: 'Remove from team', removed: (e: string) => `${e} was removed`,
    leaveTitle: (ws: string) => `Leave ${ws}?`, leaveLead: 'Your profiles there go to the owner, and you lose access to the workspace.', leaveDo: 'Leave',
    removedYou: (ws: string) => `You’re no longer in ${ws}. Its profiles were closed and removed from this computer.`,
    groupAccess: 'Group access', groupAccessNone: 'There are no groups yet. Make one on the Groups page.',
    groupMembers: 'Who may reach it', groupInherits: 'A group also lets in whoever its parent group lets in, unless that is turned off for it.',
    invites: 'Invitations to you', join: 'Join', decline: 'Decline', from: (who: string, role: string) => `From ${who}, as ${role}`
  },
  activity: {
    title: 'Activity log', person: 'Person', everyone: 'Everyone', kind: 'Showing',
    search: 'Search profiles, people or actions', cols: { time: 'Time', person: 'Person', what: 'What happened', kind: 'Kind', device: 'Computer' },
    kinds: { all: 'Everything', open: 'Opening and closing', profiles: 'Profile changes', trash: 'Trash', proxies: 'Proxies and groups', cookies: 'Cookies and exports', team: 'Team', extensions: 'Extensions', automation: 'Automation' },
    export: 'Export CSV', exported: (path: string) => `Saved to ${path}`, more: 'Show older', empty: 'Nothing here yet.', someone: 'Someone', recent: 'Recent activity',
    today: 'Today', yesterday: 'Yesterday', on: (device: string) => `on ${device}`,
    actions: {
      'profile.create': p => `created ${p}`, 'profile.update': (p, x) => `changed the ${x.fields?.map((f: string) => enFields[f] ?? f).join(', ')} of ${p}`,
      'profile.move': (p, x) => (x.group ? `moved ${p} to ${x.group}` : `took ${p} out of its group`), 'profile.tag': (p, x) => `tagged ${p} “${x.tag}”`,
      'profile.untag': (p, x) => `removed the tag “${x.tag}” from ${p}`, 'profile.set-proxy': (p, x) => (x.proxy ? `set the proxy of ${p} to ${x.proxy}` : `removed the proxy of ${p}`),
      'profile.assign': (p, x) => (x.to ? `assigned ${p} to ${x.to}` : `unassigned ${p}`),
      'profile.trash': p => `moved ${p} to the Trash`, 'profile.restore': p => `restored ${p}`, 'profile.purge': p => `deleted ${p} for good`,
      'profile.open': (p, x) => (x.via === 'api' ? `opened ${p} through the API` : `opened ${p}`), 'profile.close': p => `closed ${p}`, 'profile.takeover': (p, x) => `took over ${p} from ${x.from ?? 'another computer'}`,
      'proxy.create': (_p, x) => `added the proxy ${x.name}`, 'proxy.import': (_p, x) => `imported ${x.added} ${x.added === 1 ? 'proxy' : 'proxies'}`,
      'proxy.update': (_p, x) => `changed the proxy ${x.name}`, 'proxy.delete': (_p, x) => `deleted the proxy ${x.name}`,
      'group.members': (_p, x) => `changed who may reach ${x.name}`,
      'group.create': (_p, x) => `created the group ${x.name}`, 'group.rename': (_p, x) => `renamed the group ${x.from} to ${x.name}`, 'group.delete': (_p, x) => `deleted the group ${x.name}`,
      'member.invite': (_p, x) => `invited ${x.email} as ${x.role}`, 'member.join': (_p, x) => `joined as ${x.role}`,
      'member.role': (_p, x) => `made ${x.email} ${x.role}`, 'member.remove': (_p, x) => `removed ${x.email}; their profiles went to ${x.to}`,
      'member.leave': () => 'left the team', 'invitation.withdraw': (_p, x) => `withdrew the invitation to ${x.email}`,
      'role.create': (_p, x) => `made the role ${x.name}`, 'role.update': (_p, x) => `changed what ${x.name} may do`, 'role.delete': (_p, x) => `deleted the role ${x.name}`,
      'cookies.export': (p, x) => `exported ${x.count} ${x.count === 1 ? 'cookie' : 'cookies'} of ${p}`, 'cookies.import': (p, x) => `imported ${x.count} ${x.count === 1 ? 'cookie' : 'cookies'} into ${p}`,
      'workspace.export': (_p, x) => `exported all data (${profilesN(x.profiles)}, ${x.proxies} ${x.proxies === 1 ? 'proxy' : 'proxies'})`,
      'workspace.import': (_p, x) => `imported ${profilesN(x.profiles)}, ${x.proxies} new ${x.proxies === 1 ? 'proxy' : 'proxies'} and ${x.groups} new ${x.groups === 1 ? 'group' : 'groups'}`,
      'flow.create': (_p, x) => `created the flow ${x.name}`, 'flow.update': (_p, x) => (x.from ? `renamed the flow ${x.from} to ${x.name}` : `changed the flow ${x.name}`),
      'flow.delete': (_p, x) => `deleted the flow ${x.name}`,
      'task.create': (_p, x) => `created the task ${x.name}`, 'task.update': (_p, x) => (x.from ? `renamed the task ${x.from} to ${x.name}` : `changed the task ${x.name}`),
      'task.delete': (_p, x) => `deleted the task ${x.name}`, 'run.start': (_p, x) => `started ${x.name} on ${profilesN(x.profiles)}${x.trigger === 'rerun' ? ' (again)' : ''}`,
      'run.finish': (_p, x) => `${x.name} ${x.status === 'stopped' ? 'stopped' : 'finished'}: ${x.ok} done, ${x.failed} failed${x.signedOut ? `, ${x.signedOut} signed out` : ''}${x.skipped ? `, ${x.skipped} not run` : ''}`,
      'extension.add': (_p, x) => `added the extension ${x.name} ${x.version}`, 'extension.update': (_p, x) => `updated the extension ${x.name} from ${x.from} to ${x.version}`,
      'extension.delete': (_p, x) => `deleted the extension ${x.name}`, 'profile.add-extension': (p, x) => `installed ${x.extension} in ${p}`, 'profile.remove-extension': (p, x) => `uninstalled ${x.extension} from ${p}`,
      'profile.set-kernel': (p, x) => `changed the engine of ${p} to ${x.kernel === 'firefox' ? 'Firefox' : 'Chromium'} ${x.version}`,
      'profile.set-browser': (p, x) => (x.searchEngine ? `set the search engine of ${p} to ${enSearch(x.searchEngine)}` : `turned ${x.restoreTabs ? 'on' : 'off'} restoring tabs for ${p}`)
    } satisfies Record<ActivityAction, Said>
  },
  transfer: {
    exportTitle: 'Export all data', exportLead: 'One file with every profile (fingerprints and settings), its sign-ins, the groups and the proxies with their passwords. Profiles in the Trash stay behind.',
    passphrase: 'Passphrase', confirm: 'Passphrase again', passHelp: 'At least 10 characters. The file opens only with it, and it is not kept anywhere: if it is lost, so is the file.',
    passShort: 'Use at least 10 characters.', passMismatch: 'The two passphrases differ.', export: 'Export', exporting: 'Exporting…', exported: (path: string) => `Saved to ${path}`,
    importTitle: 'Import data', importLead: 'Brings a .folio file into this workspace: its profiles are added and numbered here, and identical proxies and same-named groups are reused.',
    choose: 'Choose a .folio file…', unlock: 'Unlock', unlocking: 'Unlocking…',
    preview: (p: { workspace: string; profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }) => `From ${p.workspace}: ${profilesN(p.profiles)} (${p.signedIn} with sign-ins), ${p.proxies} ${p.proxies === 1 ? 'proxy' : 'proxies'}, ${p.groups} ${p.groups === 1 ? 'group' : 'groups'}${p.extensions ? `, ${p.extensions} ${p.extensions === 1 ? 'extension' : 'extensions'}` : ''}.`,
    room: (free: number) => `The plan has room for ${profilesN(free)} more.`, import: 'Import', importing: 'Importing…',
    imported: (r: { profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }) => `${profilesN(r.profiles)} imported, ${r.signedIn} with sign-ins; ${r.proxies} new ${r.proxies === 1 ? 'proxy' : 'proxies'}, ${r.groups} new ${r.groups === 1 ? 'group' : 'groups'}${r.extensions ? `, ${r.extensions} new ${r.extensions === 1 ? 'extension' : 'extensions'}` : ''}`
  },
  flows: {
    title: 'Flows', new: 'New flow',
    template: 'Sign-in check template', templateName: 'Sign-in check',
    cols: { name: 'Flow', steps: 'Steps', by: 'Created by', updated: 'Changed' },
    empty: 'No flows yet. A flow is a list of steps (open a page, click, type, extract…) that runs on one profile or many.',
    you: 'You', view: 'View', duplicate: 'Duplicate', duplicateToEdit: 'Duplicate to edit', delete: 'Delete', deleteX: (n: string) => `Delete ${n}`,
    inUse: (tasks: string) => `Used by ${tasks}; it can’t be deleted.`, confirmDelete: (n: string) => `Delete “${n}”?`, deleted: (n: string) => `${n} deleted`, copyName: (n: string) => `${n} (copy)`, untitled: 'New flow',
    back: 'Flows', backLabel: 'Back to flows', name: 'Flow name', nameNeeded: 'Give the flow a name.', save: 'Save', saving: 'Saving…', saved: 'Flow saved',
    leave: 'Leave without saving your changes?', keepEditing: 'Keep editing', discard: 'Discard changes',
    readOnly: 'Only whoever created this flow, admins and the owner can change it. Duplicate it to make your own version.',
    stale: 'Someone saved this flow while you were editing. Save again to replace their version with yours.',
    issues: (n: number) => (n === 1 ? '1 step needs filling in before saving.' : `${n} steps need filling in before saving.`),
    steps: 'Steps', noSteps: 'No steps.', add: 'Add step',
    groups: { page: 'Page actions', data: 'Data', logic: 'Logic', other: 'Other' },
    about: {
      open: 'Go to an address', click: 'Click an element', type: 'Type text into a field', press: 'Press a key or a shortcut', wait: 'Pause, or wait for an element',
      scroll: 'Scroll the page, or to an element', extract: 'Read text or an attribute into a variable', set: 'Give a variable a value', screenshot: 'Capture the page or one element',
      signedIn: 'Stop when the profile is signed out', if: 'Run steps only when something is true', loop: 'Repeat steps, or run them for each element', script: 'Run JavaScript in the page'
    } satisfies Record<Step['type'], string>,
    start: { title: 'A flow is a list of steps', body: 'It does what you would do by hand: open a page, click, type, read what it shows. Add steps from the menu, then try them on a profile on the right.', template: 'Start from the sign-in check' },
    types: { open: 'Open URL', click: 'Click', type: 'Type', press: 'Press key', wait: 'Wait', scroll: 'Scroll', extract: 'Extract', set: 'Set variable', if: 'If', loop: 'Repeat', screenshot: 'Screenshot', script: 'Run script', signedIn: 'Check signed in' } satisfies Record<Step['type'], string>,
    up: (p: string) => `Move step ${p} up`, down: (p: string) => `Move step ${p} down`, copyStep: (p: string) => `Duplicate step ${p}`, remove: (p: string) => `Remove step ${p}`,
    then: 'When true', else: 'Otherwise', each: 'Each time', end: 'End',
    settings: 'Step settings', pick: 'Pick a step in the chart to change it.', stepN: (p: string) => `Step ${p}`, upToDate: 'Saved',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    // A step in one line, on its node in the chart.
    sum: {
      secs: (a: number, b: number | null) => (b ? `${a}–${b} s` : `${a} s`), until: (what: string, sel: string, s: number) => `${what} ${sel} · up to ${s} s`,
      pixels: (n: number) => `${n} px`, into: (sel: string, what: string, v: string) => `${sel} ${what} → {{${v}}}`,
      contains: (sel: string, t: string) => `${sel} contains “${t}”`, exists: (sel: string) => `${sel} is there`,
      times: (n: number) => (n === 1 ? 'Once' : `${n} times`), each: (sel: string) => `Each ${sel}`, empty: 'Not filled in yet'
    },
    issue: { url: 'Enter the address to open.', selector: 'Say which element.', key: 'Name the key.', variable: 'Variable names use letters, digits and _, and don’t start with a digit.', pixels: 'Enter how far to scroll.', times: 'Repeat at least once.', code: 'Write the script.', attribute: 'Name the attribute.' },
    f: {
      selector: 'Element', selectorPh: '#login, .price, text=Sign in', variable: 'Variable', url: 'Address', text: 'Text', slow: 'Type one character at a time, like a person',
      key: 'Key', until: 'Wait for', untilTime: 'Time', untilVisible: 'Element to appear', untilHidden: 'Element to go away',
      seconds: 'Seconds', maxSeconds: 'Up to (random)', optional: 'Optional', limit: 'Give up after (s)',
      to: 'Scroll', toElement: 'To an element', toPixels: 'By pixels', toBottom: 'To the bottom', pixels: 'Pixels (negative goes up)',
      take: 'Take', takeText: 'Its text', takeAttr: 'An attribute', attribute: 'Attribute', into: 'Into variable', value: 'Value',
      shot: 'Capture', shotPage: 'Whole page', shotElement: 'One element', code: 'JavaScript', result: 'Keep what it returns in',
      scriptHint: 'Runs in the page; use return to hand back a value. On Firefox profiles the script can’t see the page’s own JavaScript unless it starts with mw:.',
      test: 'When', exists: 'An element is there', contains: 'An element’s text contains', equals: 'A variable equals',
      repeat: 'Repeat', repeatTimes: 'A number of times', repeatEach: 'For each matching element', times: 'Times',
      eachHint: 'Inside, @item is the current element (@item >> a looks inside it) and {{loop.index}} counts from 1.', timesHint: 'Inside, {{loop.index}} counts from 1.',
      signedBy: 'Signed in when', signedPresent: 'This element shows up', signedAbsent: 'This element doesn’t show up',
      signedHint: 'For example an avatar or account menu that only signed-in visitors see, or a “Log in” button that only signed-out visitors see. A profile found signed out stops there and, in a task, you get a desktop notification.'
    },
    trial: {
      title: 'Trial run', lead: 'Runs the steps as they are now, saved or not, in a new tab of the profile. The browser stays open afterwards.',
      profile: 'On profile', noProfiles: 'No profiles yet', vars: 'Variables for this run (name=value, one per line)', run: 'Run', stop: 'Stop', log: 'Log',
      ms: (n: number) => (n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`), times: (n: number) => (n === 1 ? '1 time' : `${n} times`),
      ok: 'Finished.', signedOut: 'The check found this profile signed out.', notOpened: (why: string) => `The profile didn’t open: ${why}`, failed: (why: string) => `Stopped at a failed step: ${why}`, shot: (name: string) => `Show ${name}`
    },
    errors: {
      timeout: 'Timed out: the element didn’t show up, or the page didn’t finish loading.', navigation: 'The page couldn’t be opened.', script: 'The script failed.',
      variable: (name: string) => `{{${name}}} has no value.`, no_item: '@item only works inside “For each matching element”.',
      closed: 'The browser or tab was closed.', stopped: 'Stopped.', failed: 'The step failed.',
      too_long: (min: string) => `Ran past the task’s limit of ${min} min.`, signed_out: 'Signed out.'
    }
  },
  tasks: {
    title: 'Scheduled tasks', new: 'New task', needFlow: 'Make a flow first, on the Flows page.',
    empty: 'No tasks yet. A task runs a flow on a set of profiles, a few at a time, and keeps each run’s results.',
    cols: { task: 'Task', profiles: 'Profiles', when: 'When', last: 'Last run', on: 'Runs on', by: 'Created by', profile: 'Profile', status: 'Result', attempts: 'Tries', time: 'Time', result: 'Details' },
    views: { label: 'View', list: 'List', calendar: 'Calendar' },
    here: 'This computer', starter: 'Whoever runs it', n: (n: number) => String(n),
    latest: (task: string) => `Latest run · ${task}`, took: (s: number) => (s < 60 ? `took ${s} s` : `took ${Math.floor(s / 60)} min ${s % 60} s`),
    calendar: {
      prev: 'Previous week', next: 'Next week', thisWeek: 'This week', none: 'No scheduled times this week.',
      range: (a: Date, b: Date) => `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString('en-US', a.getMonth() === b.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}, ${b.getFullYear()}`,
      at: (time: string, n: number) => `${time} · ${n}`
    },
    never: 'Not run yet', manual: 'By hand', next: (at: string) => `Next: ${at}`, done: 'Its time has passed', on: (device: string) => `On ${device}`,
    once: (at: string) => `Once, ${at}`, everyDay: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends', dayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    onlyOpen: 'Scheduled tasks run on their computer while Folio is open and logged in there; times missed are recorded, not run late.', enableStartup: 'Start Folio with this computer',
    run: 'Run', runX: (n: string) => `Run ${n}`, stop: 'Stop', delete: 'Delete', deleteX: (n: string) => `Delete ${n}`,
    noProfilesHere: 'None of its profiles are yours to run.', runningElsewhere: 'It is running now.',
    confirmDelete: (n: string) => `Delete “${n}” and its runs?`, deleted: (n: string) => `${n} deleted`, started: (n: string) => `${n} started on this computer`,
    saved: 'Task saved', stale: 'Someone changed this task in the meantime. Open it again and redo your change.',
    status: { running: 'Running', done: 'Finished', stopped: 'Stopped', interrupted: 'Interrupted', missed: 'Missed', busy: 'Skipped' },
    progress: (done: number, all: number) => `${done} of ${all} done`, elsewhere: (where: string) => `on ${where}`,
    counts: (c: { ok: number; failed: number; signed_out: number; skipped: number; canceled: number }) => [c.ok && `${c.ok} done`, c.signed_out && `${c.signed_out} signed out`, c.failed && `${c.failed} failed`, c.skipped && `${c.skipped} skipped`, c.canceled && `${c.canceled} not run`].filter(Boolean).join(' · ') || 'Nothing ran',
    back: 'Tasks', backLabel: 'Back to tasks', about: (flow: string, n: number, conc: number, retries: number) => `${flow} · ${profilesN(n)} · ${conc} at a time · ${retries === 0 ? 'no retries' : retries === 1 ? '1 retry' : `${retries} retries`}`,
    runs: 'Runs', noRuns: 'No runs yet.', triggers: { manual: 'Manual', rerun: 'Rerun', schedule: 'Scheduled' }, result: 'Run results',
    missedNote: (at: string, device: string) => `Nothing ran at ${at}: Folio wasn’t open and logged in on ${device || 'its computer'}, or the computer was asleep.`,
    busyNote: (at: string) => `Nothing ran at ${at}: the run before was still going.`, runNow: 'Run it now',
    startedBy: (who: string, device: string | null, when: string) => `${who}${device ? ` on ${device}` : ''}, ${when}`,
    rerun: (n: number) => `Run the ${n === 1 ? 'one' : n} that didn’t finish again`, export: 'Export CSV', exported: (path: string) => `Saved to ${path}`,
    csv: { number: 'Number', profile: 'Profile', status: 'Result', attempts: 'Tries', problem: 'Problem' },
    item: { pending: 'Waiting', running: 'Running', ok: 'Done', failed: 'Failed', signed_out: 'Signed out', skipped: 'Skipped', canceled: 'Not run' },
    noLog: 'Nothing was logged.', attempt: (n: number) => `Try ${n}`, shotsWhere: (device: string) => (device ? `Screenshots are kept on ${device}.` : 'Screenshots are kept on the computer that ran it.'),
    skip: { locked: 'Open on another computer.', not_found: 'The profile no longer exists.', in_trash: 'The profile is in the Trash.', forbidden: 'Not one of your profiles any more.', scripted: 'A script was driving it through the local API.' } as Record<string, string>,
    form: {
      newTitle: 'New task', editTitle: 'Edit task', create: 'Create task', save: 'Save changes', name: 'Name', flow: 'Flow',
      profiles: (n: number) => `Profiles · ${n} selected`, search: 'Search profiles', all: 'Select all shown', none: 'No profiles match.',
      concurrency: 'At a time', retries: 'When one fails', retriesN: (n: number) => (n === 0 ? 'Don’t retry' : n === 1 ? 'Retry once' : `Retry up to ${n} times`),
      timeout: 'Time limit per profile', minutes: (n: number) => (n === 1 ? '1 minute' : `${n} minutes`),
      memory: 'Each open profile takes roughly 300–500 MB of memory; set how many run at a time to suit this computer.',
      when: 'When it runs', kinds: { none: 'By hand', once: 'Once', daily: 'Daily' }, at: 'Date and time', time: 'Time', days: 'Days',
      runsHere: 'It runs on this computer, at this computer’s time.', runsOn: (device: string, email: string) => `It runs on ${device} (${email}), at that computer’s time.`,
      moveHere: 'Run it on this computer instead', scheduleHelp: 'Folio has to be open and logged in there; a time missed is recorded and can be run from its record.',
      vars: 'Variables per profile', varsHelp: 'Optional. A spreadsheet whose first column names the profile (name or number) and whose other columns are variables, used in the flow as {{column}}. Kept encrypted; only people who can edit the task see them.',
      varsStored: (n: number, names: string) => `Set for ${profilesN(n)}: ${names}`, varsCleared: 'They will be removed when you save.',
      varsReplace: 'Replace…', varsClear: 'Remove', varsKeep: 'Keep the current ones',
      varsReady: (n: number, names: string) => `${names} for ${profilesN(n)}.`,
      varErrs: { header: 'the first row needs the profile column and at least one variable', variable: 'variable names use letters, digits and _', profile: 'not one of the profiles selected above', repeat: 'this profile is already in an earlier row' }
    }
  },
  apiPage: {
    title: 'API & scripts', reference: 'API reference',
    server: 'Local API', enable: 'On', listening: 'Listening on', off: 'Off. Turn it on to let scripts on this computer use it.', copy: 'Copy', copied: 'Copied',
    errors: { port_in_use: 'Another program uses this port. Pick another one.', listen_failed: 'The API couldn’t start on this port. Pick another one.' },
    port: 'Port', limit: 'Up to 60 requests a minute (starting, stopping, looking things up). What scripts send to the browser itself isn’t counted. Company is unthrottled.',
    unthrottled: 'Company plan: no limit on requests.',
    security: 'The debugging address has no password: while a profile opened through the API is running, any program on this computer can control it. Profiles you open yourself have no debugging address.',
    tokens: 'Tokens',
    newToken: 'Copy this token now; it isn’t shown again.', done: 'Done', tokenName: 'Name, e.g. order sync', createToken: 'Make a token', defaultName: 'Token',
    made: (date: string) => `Made ${date}`, used: (date: string) => `last used ${date}`, unused: 'not used yet', revoke: 'Revoke', revokeX: (n: string) => `Revoke ${n}`, otherWorkspace: 'Another workspace',
    examples: 'Examples', exampleNames: { playwright: 'Playwright', puppeteer: 'Puppeteer', selenium: 'Selenium', firefox: 'Firefox profiles' },
    copyAddress: 'Copy address', limited: 'over the limit',
    placeholder: 'Replace <token> with one of your tokens; a token is shown only when it is made.',
    calls: 'Recent calls', noCalls: 'No script has called it yet. Calls show up here as they happen.', noToken: 'No valid token'
  },
  extensions: {
    title: 'Extensions', add: 'Add extension',
    memberNote: 'Owners and admins keep the library. You can install its extensions in your own profiles, from the profile form or the bulk actions.',
    empty: 'No extensions yet. Add one from a file or its store, then install it in profiles.',
    cols: { name: 'Extension', engine: 'Engine', version: 'Version', signature: 'Signature', profiles: 'Profiles', updated: 'Changed' },
    search: 'Search extensions', noMatch: 'No extensions match.', inProfiles: (n: number) => profilesN(n),
    install: 'Install in profiles…', installTitle: (n: string) => `Install ${n}`, installMany: (n: number) => `Install ${n} extensions`,
    installDo: (n: number) => (n ? `Install in ${profilesN(n)}` : 'Install'), installedHere: 'Installed', noProfiles: 'No profiles of this engine yet.',
    deleteNote: 'Profiles keep working without it; it can be added again later.',
    uploaded: 'Uploaded file', update: 'New version', delete: 'Delete', deleteX: (n: string) => `Delete ${n}`,
    signed: 'Signature checked', signedNote: 'Before installing it in a profile, Folio checks the package against its signature and checksum, and leaves it out if either fails.',
    confirmDelete: (n: string, count: number) => (count ? `Delete “${n}”? It comes off ${profilesN(count)}.` : `Delete “${n}”?`),
    deleted: (n: string) => `${n} deleted`, added: (n: string) => `${n} added to the library`, updated: (n: string) => `${n} updated; profiles get it the next time they open`,
    addTitle: 'Add an extension', updateTitle: (n: string) => `New version of ${n}`, from: 'From', fromFile: 'A file', fromStore: (k: string): string => (k === 'chromium' ? 'Chrome Web Store' : 'addons.mozilla.org'),
    chooseFile: 'Choose a file…', fileHintChromium: 'A .crx or .zip with manifest.json at the top.', fileHintFirefox: 'An .xpi (or .zip) with manifest.json at the top.',
    storeChromium: 'Link or extension id', storeFirefox: 'Link to the add-on (or its short name)',
    idNote: 'Folio gives the extension a key of its own so it has the same id on every computer and its data can follow the profile. Its id differs from the store’s, which a few extensions that pair with a desktop program or a site rely on.',
    uuidNote: 'Each profile gets its own internal address for the add-on, so sites can’t link profiles through it.',
    addDo: 'Add', updateDo: 'Upload', uploading: 'Uploading…', fetching: 'Downloading from the store…',
    failedCheck: (profile: string, names: string[]) => `${profile} opened without ${names.join(', ')}: ${names.length === 1 ? 'it' : 'they'} didn’t pass the integrity check.`
  },
  windowSync: {
    title: 'Window sync', on: 'Window sync is on.', onBadge: 'On',
    summary: (leader: string, n: number) => `${leader} leads and ${n === 1 ? '1 window follows' : `${n} windows follow`}.`,
    leaderTag: 'Leader', followerTag: 'Sync', makeLeader: 'Make leader', stop: 'Stop sync', current: 'Syncing now',
    address: 'Address for every window', addressPh: 'Open an address in every window', open: 'Open',
    pick: 'Pick the windows',
    running: 'Open', start: (n: number) => (n < 2 ? 'Pick at least two' : `Sync ${n} windows`), starting: 'Starting…',
    ops: { label: 'Repeat', click: 'Clicks', typing: 'Typing', scroll: 'Scrolling' },
    delay: 'Random pause', seconds: 's', delayMin: 'Shortest pause, in seconds', delayMax: 'Longest pause, in seconds',
    synced: (n: number, bad: number) => `${n === 1 ? '1 window' : `${n} windows`} in sync${bad ? ` · ${bad} with a problem` : ''}`,
    workHere: 'Work here', inSync: 'In sync', shotWait: 'Waiting for a picture…',
    notFound: (label: string | null) => (label ? `Couldn’t find “${label}”` : 'Element not found'), failed: 'Couldn’t repeat',
    issues: {
      coords: (label: string | null) => `${label ? `Couldn’t find “${label}”` : 'Couldn’t find the element the leader clicked'}, so the click went to the same place in this window.`,
      failed: () => 'Something couldn’t be repeated here; look at this window.'
    },
    log: 'Recent sync', logEmpty: 'What happens in the leader window is listed here.',
    did: {
      click: (label: string | null) => (label ? `Clicked “${label}”` : 'Clicked'), text: (t: string) => `Typed “${t}”`, key: (k: string) => `Pressed ${k}`,
      scroll: (px: number) => `Scrolled to ${px.toLocaleString('en-US')} px`, goto: (url: string) => `Opened ${url}`,
      tab: { open: (n: number) => `Opened tab ${n}`, close: (n: number) => `Closed tab ${n}`, switch: (n: number) => `Went to tab ${n}` }
    },
    upgrade: 'Window sync comes with the Studio and Company plans.',
    upsell: {
      title: 'Do it once, in every window', lead: 'Pick a leader window: its clicks, typing, keys, scrolling, addresses and tabs repeat in the other windows as you work.',
      points: ['Open the same page in every profile at once', 'Fill in the same form for many shops in one pass', 'Lay all the windows out in a grid with one click'],
      ask: 'Ask the workspace owner or an admin to upgrade.'
    },
    tile: 'Tile windows', tiling: 'Arranging…',
    tiled: (moved: number, total: number) => (moved === total ? `Arranged ${total} windows in a grid.` : `Arranged ${moved} of ${total} windows.`),
    tileMissed: {
      unsupported: 'Firefox windows can’t be moved on Linux.',
      permission: 'To move Firefox windows, allow Folio in System Settings › Privacy & Security › Accessibility (and under Automation if macOS asks), then tile again.',
      failed: 'The other windows couldn’t be moved.'
    }
  },
  palette: {
    title: 'Command palette', placeholder: 'Search profiles, pages or actions', groups: { profiles: 'Profiles', actions: 'Actions', pages: 'Pages' },
    none: 'Nothing matches.', move: 'select', run: 'run', close: 'close', open: 'open', switchTo: 'switch to its window', stop: (n: string) => `Stop ${n}`,
    newProfile: 'New profile', importProfiles: 'Import profiles', checkProxies: 'Check all proxies', addProxy: 'Add a proxy',
    switchWs: (n: string) => `Switch to ${n}`, language: 'Switch to 简体中文'
  },
  risks: {
    title: (n: number) => (n === 1 ? '1 thing could link your profiles' : `${n} things could link your profiles`), show: 'Show', hide: 'Hide',
    only: 'Show these profiles', clear: 'Show all profiles', flag: 'May be linked to other profiles',
    kinds: {
      'same-proxy': { t: (n: number, x: string) => `${n} profiles share the proxy ${x}`, fix: 'Give each profile its own proxy.' },
      'same-ip': { t: (n: number, x: string) => `${n} profiles came out of the same IP ${x} through different proxies`, fix: 'Their proxies lead to one address. Ask the provider for separate exits.' },
      direct: { t: (n: number) => `${n} profiles connect straight from this computer`, fix: 'Without proxies, sites see this computer’s address for all of them.' },
      'moved-country': { t: (_n: number, x: string) => `Its exit changed country since last time (${x})`, fix: 'A sudden change of country can make sites ask for verification. Keep each profile’s exit in one place.' },
      'moved-ip': { t: (_n: number, x: string) => `Its exit IP changed since last time (${x})`, fix: 'Same country: most sites accept this, a few ask to verify.' },
      'same-fp': { t: (n: number) => `${n} profiles have the same fingerprint`, fix: 'Regenerate the fingerprint of all but one, in Edit.' },
      'same-canvas': { t: (n: number) => `${n} profiles draw canvas the same way`, fix: 'Their health checks found identical canvas drawings. Regenerate their fingerprints.' }
    }
  },
  checkup: {
    run: 'Health check', running: 'Checking…', title: (n: string) => `Health check · ${n}`, card: 'FOLIO · HEALTH CHECK', passed: 'PASSED', review: 'REVIEW',
    last: (when: string, ok: boolean) => `Last health check ${when}: ${ok ? 'passed' : 'needs attention'}`, view: 'View report', again: 'Check again',
    lead: 'Opens a check page in the profile’s browser and reads what sites can see.', failed: 'The health check couldn’t run in this profile.',
    seen: 'Seen: ', want: 'expected: ', none: 'none',
    checks: {
      webrtc: { t: 'WebRTC shows no other address', fix: 'A real or local address leaked through WebRTC. Check that the profile has a proxy and opens through it.' },
      timezone: { t: 'Time zone matches the exit', fix: 'Set the time zone to follow the proxy, in Edit.' },
      language: { t: 'Language matches the exit', fix: 'Set the language to follow the proxy, in Edit.' },
      ua: { t: 'User agent matches the system', fix: 'The browser reports another system than the profile’s. Regenerate its fingerprint.' },
      canvas: { t: 'Canvas drawing is unique in the team', fix: 'Another profile draws canvas the same way. Regenerate the fingerprint of one of them.' },
      webgl: { t: 'WebGL', fix: '' }
    }
  },
  retry: 'Try again',
  errors: {
    invalid_credentials: 'The email or password is not right.',
    unauthenticated: 'Your session has ended. Log in again.',
    rate_limited: 'Too many attempts. Wait a minute and try again.',
    validation: 'Enter your email and password.',
    network: 'Can’t reach Folio. Check your connection and try again.',
    internal: 'Something went wrong on our side. Try again.',
    plan_limit: 'The plan has no room for more profiles. Move some to the Trash or add profiles to the plan.',
    group_exists: 'There’s already a group with that name.',
    bad_reference: 'That group, proxy or person is no longer in the workspace. Pick another one.',
    forbidden: 'Your role doesn’t allow that. Ask an owner or admin.',
    seat_limit: 'The plan has no free seat. Upgrade it to invite more people.',
    already_member: 'This person is already in the team.',
    group_cycle: 'A group cannot sit inside itself.',
    plan_required: 'Authorising people for a group comes with the Company plan.',
    owner: 'The owner stays in the team and keeps their role.',
    wrong_account: 'This invitation is for a different email address.',
    email_unverified: 'Confirm your email address on the Folio website first.',
    invitation_expired: 'This invitation has expired. Ask for a new one.',
    local_only: 'This profile keeps its sign-ins on the computer that uses it. Open it there to export or import cookies.',
    cookies_unreadable: 'No cookies found in that file. Use JSON (Cookie-Editor, EditThisCookie) or cookies.txt.',
    locked: 'This profile is open on another computer.',
    not_found: 'Nothing has been saved for this profile yet.',
    wrong_passphrase: 'That passphrase does not open this file.',
    not_folio: 'That is not a Folio export file.',
    passphrase_short: 'Use a passphrase of at least 10 characters.',
    flow_too_deep: 'Steps can nest four levels deep at most.',
    flow_too_long: 'A flow can have up to 300 steps.',
    flow_in_use: 'Tasks use this flow. Delete them, or have them use another flow, first.',
    task_running: 'This task is already running.',
    no_profiles: 'None of this task’s profiles can run (they are gone, in the Trash, or not yours).',
    run_finished: 'This run has already finished.',
    extension_exists: 'This add-on is already in the library. Upload the new version to it instead.',
    extension_mismatch: 'That package is a different add-on.',
    extension_unreadable: 'That isn’t a readable extension package (crx, zip or xpi with manifest.json at the top).',
    extension_kernel: 'That extension is made for the other engine.',
    store_ref: 'That doesn’t look like a store link or id.',
    store_failed: 'The store didn’t hand over the extension. Check the link, or download it and upload the file.',
    no_device: 'Log out and back in to this app once before scheduling tasks on this computer.',
    already_run: 'This scheduled time has already run.',
    kernel_exists: 'This version is already in the catalog for that system.',
    upload_incomplete: 'The upload did not finish. Upload the file again.',
    upload_failed: 'The upload failed. Check the connection and try again.',
    kernel_archive: 'Choose a .zip, .tar.xz or .dmg package.',
    checkup_failed: 'The health check couldn’t run in this profile.'
  } as Record<string, string>
};

export type Dict = typeof en;

export const zh: Dict = {
  login: {
    title: '登录 Folio', lead: '使用在 Folio 官网注册的账号登录。',
    email: '邮箱', password: '密码', submit: '登录',
    noAccount: '还没有账号？', create: '前往官网注册', forgot: '忘记密码？',
    demo: [['US-Store-01', '西雅图'], ['UK-Shop-01', '伦敦'], ['JP-Social-01', '东京']] as [string, string][],
    walkthrough: '工作台操作演示：检查代理、打开浏览器环境、恢复标签页、体检、安装扩展、批量打开、窗口同步与团队协作。',
    pause: '暂停演示', play: '播放演示'
  },
  nav: { profiles: '环境', proxies: '代理', extensions: '扩展', flows: '流程', sync: '窗口同步', tasks: '定时任务', api: 'API 与脚本', team: '团队', activity: '操作日志', trash: '回收站', engines: '内核' },
  groups: {
    title: '分组', all: '全部分组', none: '未分组', add: '新建分组', namePh: '分组名称', more: (g: string) => `${g} 的更多操作`,
    rename: '重命名', delete: '删除', deleteConfirm: (g: string) => `删除「${g}」？组内环境将保留并变为未分组。`,
    color: '颜色', colors: { red: '红色', blue: '蓝色', green: '绿色', amber: '橙色', purple: '紫色', teal: '青色', gray: '灰色' }
  },
  plans: { free: '体验版', studio: '工作室版', company: '公司版' },
  periods: { monthly: '月付', yearly: '年付' },
  roles: { owner: '所有者', admin: '管理员', member: '成员', viewer: '仅查看' },
  ws: { switch: '切换团队', current: '当前团队' },
  plan: {
    usage: (used: number, limit: number) => `已用 ${used} / ${limit} 个环境`,
    renews: (date: string, period: string) => `${date} 续费 · ${period}`,
    ends: (date: string) => `${date} 到期`,
    trialEnds: (date: string) => `试用于 ${date} 结束`,
    scheduled: (plan: string, date: string) => `${date} 起变更为${plan}`,
    upgrade: '升级', addProfiles: '增加环境', manage: '账单'
  },
  user: {
    account: '账户', manage: '管理账号', teams: '团队', settings: '设置', data: '数据', language: '语言',
    exportAll: '导出全部数据…', importAll: '导入数据…', logout: '退出登录',
    startup: '开机自动启动', startupHint: '开机后最小化到托盘，定时任务照常运行。'
  },
  tray: { open: '打开 Folio', quit: '退出 Folio', background: 'Folio 将在后台运行，以确保定时任务按时执行。如需退出，请使用托盘图标。' },
  notify: { signedOut: (task: string, names: string[]) => ({ title: names.length === 1 ? `${names[0]} 已掉线` : `${names.length} 个环境已掉线`, body: `${task}：${names.join('、')}` }) },
  update: {
    ready: (v: string) => `Folio ${v} 已下载完成。`, restart: '重启并更新', restartNote: '将先保存并关闭已打开的环境；如不重启，将在下次退出 Folio 时自动安装。',
    out: (v: string) => `Folio ${v} 已发布。`, download: '前往下载'
  },
  common: {
    cancel: '取消', save: '保存', close: '关闭', undo: '撤销', check: '检测', checking: '检测中…', edit: '编辑', copy: '复制', copied: '已复制',
    selected: (n: number) => `已选 ${n} 个`, clearSelection: '取消选择', selectAll: '全选当前列表', select: (x: string) => `选择 ${x}`,
    never: '从未', justNow: '刚刚', minAgo: (n: number) => `${n} 分钟前`, hAgo: (n: number) => `${n} 小时前`, yesterday: '昨天', daysAgo: (n: number) => `${n} 天前`,
    loadFailed: '列表加载失败。', loadRetry: '重新加载',
    attribution: 'IP Geolocation by DB-IP'
  },
  os: { windows: 'Windows', macos: 'macOS', linux: 'Linux' },
  profiles: {
    title: '环境', count: (n: number) => `${n} 个环境`,
    search: '搜索环境', searchPh: '搜索名称、编号、城市或标签', new: '新建环境', import: '导入',
    sum: {
      running: '运行中', proxy: '代理异常', proxyOk: '全部代理响应正常',
      proxyNote: (down: number, slow: number) => [down && `${down} 个无响应`, slow && `${slow} 个较慢`].filter(Boolean).join(' · '),
      risks: '关联风险', risksOk: '未发现关联风险'
    },
    views: { label: '视图', list: '列表', cards: '卡片' },
    filter: { label: '状态', all: '全部', states: '全部状态', running: '运行中', stopped: '未运行', issues: '需处理', starred: '已收藏', engine: '内核', engines: '全部内核' },
    star: '收藏', unstar: '取消收藏', move: '移动分组', moveTitle: (n: string) => `将「${n}」移到分组`,
    sort: '排序', sorts: { recent: '最近打开', name: '名称 A–Z', latency: '代理延迟' },
    cols: { profile: '环境名称', group: '分组', fingerprint: '指纹配置', proxy: '代理', last: '最近打开', member: '成员', status: '状态', actions: '操作' },
    open: '打开', stop: '停止', actionsX: (n: string) => `${n} 的操作`, starting: '启动中…', inUse: '正在使用',
    st: { idle: '未运行', running: '运行中', proxyDown: '代理异常' }, checkProxy: '检测代理',
    stage: { proxy: '检查代理…', restore: '恢复登录…', launch: '启动浏览器…' }, stages: ['内核', '代理', '登录', '浏览器'],
    map: {
      label: '各环境代理的出口位置',
      check: '检测全部代理', add: '添加代理'
    },
    palette: '全局搜索',
    restoring: '正在恢复登录状态…', saving: '正在保存登录状态…', inUseOn: (where: string) => `${where} 正在使用`,
    downloading: (pct: number) => `正在下载内核… ${pct}%`,
    noProxy: '无代理', unchecked: '未检测', noResponse: '无响应', ms: (n: number) => `${n} ms`, mismatch: '! 与代理不一致',
    unassigned: '未分配',
    emptyNone: '暂无环境。', emptyMatch: '无符合条件的环境。', emptyFor: (q: string) => `未找到「${q}」。`,
    emptyHint: (n: number) => `请更换关键词，或清除筛选查看全部 ${n} 个环境。`, clearFilters: '清除筛选',
    bulk: {
      open: '打开', stop: '停止', move: '移动到分组…', proxy: '设置代理…', assign: '分配给…',
      tag: '标签', tagPh: '标签名', addTag: '添加标签', removeTag: '移除标签', trash: '删除', cookies: '导出 Cookie…',
      extensions: '扩展…', install: '安装', uninstall: '卸载', sync: '同步窗口', syncTwo: '请至少选择两个环境',
      confirm: (n: number) => `将 ${n} 个环境移至回收站？`, confirmNote: '运行中的环境将先停止，此操作可撤销。', doTrash: '移至回收站'
    },
    done: {
      trashed: (n: number) => `已将 ${n} 个环境移至回收站`, moved: (n: number, g: string) => `已将 ${n} 个环境移至「${g}」`,
      tagged: (n: number, t: string) => `已为 ${n} 个环境添加标签「${t}」`, untagged: (n: number, t: string) => `已从 ${n} 个环境移除标签「${t}」`,
      proxySet: (n: number) => `已更换 ${n} 个环境的代理`, assigned: (n: number, who: string) => `已将 ${n} 个环境分配给 ${who}`,
      created: (x: string) => `「${x}」已创建`, saved: '已保存', failed: (name: string, why: string) => `${name}：${why}`,
      stale: '该环境刚被他人修改，请重试。',
      extAdded: (n: number, x: string, skipped: number) => `已为 ${n} 个环境安装 ${x}${skipped ? `，跳过 ${skipped} 个（内核不符或已安装）` : ''}`,
      extRemoved: (n: number, x: string) => `已从 ${n} 个环境卸载 ${x}`,
      syncing: (leader: string, n: number) => `窗口同步已开始：${leader} 主控，${n} 个窗口跟随`, syncFailed: '窗口同步需要至少两个已打开的环境。'
    }
  },
  launch: {
    kernel_missing: '本机尚未下载该内核。', proxy_down: '代理无响应，且没有可用的备用线路。',
    in_trash: '该环境位于回收站中。', not_found: '该环境已不存在。', launch_failed: '浏览器启动失败，请重试。',
    download_failed: '内核下载失败，请检查网络后重试。',
    locked: '该环境正在另一台电脑上使用。',
    lock_lost: '该环境已在另一台电脑上被收回，本机已关闭。',
    save_failed: '浏览器已关闭，但登录状态未能保存至 Folio，已保留在本机。'
  } as Record<string, string>,
  detail: {
    profile: '环境详情', close: '关闭详情', basics: '基础信息', proxyCard: '代理连接', dataCard: '环境数据', manage: '管理',
    viewAll: '查看全部', lastOpened: '最近打开', synced: '最近同步', answered: (ms: number) => `连接正常 · ${ms} ms`,
    openProfile: '打开环境', edit: '编辑', trash: '移至回收站',
    notChecked: '尚未检测出口', noExit: '代理无响应', direct: '直连',
    tabs: { overview: '概览', signins: '登录状态', extensions: '扩展', activity: '记录' }, more: '更多操作', fingerprint: '指纹摘要',
    verdict: { ok: '全部一致', warn: '需要处理', bad: '无法打开' }, noExtensions: '该环境未安装扩展。', noActivity: '暂无记录。',
    fields: { lang: '语言', tz: '时区', os: '系统', engine: '内核', seed: '指纹种子', cores: 'CPU 核数' },
    hostTz: '跟随本机',
    checksTitle: '一致性检查', notes: '备注', status: { ok: '通过', todo: '待处理', warn: '警告', bad: '问题' },
    storage: '登录状态', cookies: 'Cookie', siteData: '网站存储', sites: '站点', extensions: '扩展', savedOn: (when: string, device: string | null) => `${when}${device ? ` 在 ${device} 上` : ''}保存`,
    notSaved: '尚未保存。浏览器关闭时将自动保存登录状态。', localOnly: '仅保存在使用该环境的电脑上，Folio 不保留副本。',
    exportAs: (format: string) => `导出 ${format}`, importCookies: '导入 Cookie', json: 'JSON', netscape: 'cookies.txt',
    exported: (n: number, path: string) => `已导出 ${n} 个环境到 ${path}`, imported: (n: number) => `已导入 ${n} 个 Cookie`,
    exportFailed: (name: string, why: string) => `${name}：${why}`,
    inUse: '正在其他电脑上使用', away: (device: string, email: string, since: string) => `${since} 起在 ${device}（${email}）上打开。`,
    takeover: '收回', takeoverNote: '对方的浏览器将被关闭，其最近几分钟内的改动将丢失。', takeoverDo: '收回并打开'
  },
  opening: {
    title: '正在打开', of: (i: number, n: number) => `${i} / ${n}`,
    steps: { engine: '准备内核', proxy: '检查代理', restore: '恢复登录', browser: '打开浏览器' },
    engineReady: (name: string) => `${name} · 已下载`, engineGet: (done: string, total: string) => `正在下载 ${done} / ${total}`,
    checking: '正在检测出口…', exit: (place: string, ms: number) => `出口 ${place} · ${ms} ms`, direct: '无代理，使用本机 IP',
    signins: (c: number, o: number) => `${c} 个 Cookie · ${o} 个站点`, fresh: '暂无已保存的登录状态', local: '保存在使用该环境的电脑上',
    starting: '正在启动浏览器…', waiting: '待上述步骤完成'
  },
  batchOpen: {
    title: (n: number) => `正在打开 ${n} 个环境`, done: (k: number, n: number) => `已完成 ${k} / ${n}`,
    opened: '已打开', waiting: '等待中', retry: '重试', fold: '收起', unfold: '展开', close: '关闭'
  },
  checks: {
    'proxy-ok': { t: x => `代理正常 · ${x.ms} ms`, d: x => x.host },
    'proxy-slow': { t: x => `代理较慢 · ${x.ms} ms`, d: x => `${x.host}。页面可能加载超时。` },
    'proxy-down': { t: () => '代理无响应', d: x => `${x.host}。代理恢复前无法打开该环境。` },
    'proxy-backup': { t: () => '主线路无响应，将改用备用线路', d: x => x.host },
    'proxy-none': { t: () => '未设置代理', d: () => '网站获取的是本机 IP。' },
    'proxy-unchecked': { t: () => '代理尚未检测', d: x => `${x.host}。检测后可查看出口位置。` },
    'tz-ok': { t: () => '时区与出口 IP 一致', d: x => x.tz },
    'tz-host': { t: () => '时区跟随本机', d: () => '未设置代理时，网站本可获取本机位置。' },
    'tz-pending': { t: () => '出口未检测，时区暂时跟随本机', d: () => '检测代理后，时区和语言将跟随出口所在地。' },
    'tz-mismatch': { t: () => '时区与出口 IP 不一致', d: x => `手动设置为 ${x.set}，但代理出口位于 ${x.city}（${x.tz}）。` },
    'lang-ok': { t: () => '语言与地区一致', d: x => x.lang },
    'lang-mismatch': { t: () => '语言与出口 IP 不一致', d: x => `手动设置为 ${x.setLang}，但代理出口位于 ${x.country}。` },
    geo: { t: x => `地理位置设在 ${x.city} 附近`, d: () => '精度约 50 米' },
    rtc: { t: () => 'WebRTC 只显示代理 IP', d: () => '本机真实 IP 不会泄露' },
    'rtc-off': { t: () => 'WebRTC 已禁用', d: () => '需要通话或视频的网站在此环境中无法使用。' },
    'fp-real': { t: x => `${x.real} 使用本机真实值`, d: () => '同一台电脑上的环境可能因此被关联。' },
    'engine-ok': { t: x => `${x.kernel} ${x.version}`, d: () => '推荐版本' },
    'engine-older': { t: x => `${x.kernel} ${x.version}`, d: x => `推荐版本为 ${x.latest}，升级后指纹保持不变。` },
    'engine-missing': { t: x => `${x.kernel} ${x.version} 尚未下载`, d: x => `${x.size}，所有环境共用，仅需下载一次。打开环境时自动下载。` },
    'engine-unavailable': { t: x => `${x.kernel} ${x.version} 不支持本机系统`, d: x => `改用 ${x.latest} 即可在本机打开。` }
  },
  fixes: { check: '重新检测', backup: '将备用线路设为主线路', 'choose-proxy': '选择代理', 'follow-tz': '跟随代理', 'follow-lang': '跟随代理', download: '下载', use: (v: string) => `改用 ${v}`, edit: '修改设置' },
  fp: {
    title: '指纹配置', random: '生成随机指纹',
    screen: '分辨率', screenRandom: '随机（按系统）', screenHost: '跟随本机',
    webrtc: 'WebRTC', webrtcOpts: { udp: '禁用非代理 UDP', replace: '替换为代理 IP', block: '禁用' },
    webgl: 'WebGL', webglOpts: { spoof: '随机显卡', real: '真实显卡' },
    canvas: 'Canvas', canvasOpts: { noise: '噪声', real: '真实', engine: '由内核决定' }
  },
  form: {
    newTitle: '新建环境', editTitle: '编辑环境', name: '名称', defaultName: (n: number) => `环境 ${n}`, nameErr: '请填写名称。',
    basic: '基本信息', engineProxy: '内核与代理', more: '更多设置', preview: '预览',
    group: '分组', noGroup: '未分组', newGroup: '新建分组…', newGroupPh: '新分组名称',
    engine: '内核', os: '操作系统',
    proxy: '代理', proxyMode: { saved: '使用已有代理', custom: '自定义代理', none: '不使用代理' }, pickProxy: '选择代理',
    pickErr: '请选择代理，或改为不使用代理。', pastePh: 'socks5://用户名:密码@主机:端口',
    proxyBad: '无法识别该代理地址。',
    proxyOk: (place: string, ms: number) => `连接正常 · ${place} · ${ms} ms`, proxyDown: '连接失败',
    tags: '标签', tagsPh: '用逗号分隔', fp: '指纹',
    regenWarn: '网站会将其识别为新设备，已登录的网站可能要求重新验证。', fpErr: '指纹生成失败。',
    firefoxMissing: '需先下载 Firefox 内核才能生成该指纹。', download: '下载', downloading: (pct: number) => `正在下载… ${pct}%`,
    create: '创建环境', save: '保存修改', tz: '时区', lang: '语言', follow: '跟随代理', custom: '手动设置',
    tzPh: '搜索时区，如 Berlin', langPh: 'de-DE', tzNone: '没有匹配的时区。', langErr: '请使用 de-DE 格式的语言代码。', searchPh: '搜索…',
    notes: '备注', engineVersion: '内核版本', owner: '负责人',
    extensions: '扩展', noExtensions: (engine: string) => `扩展库中暂无 ${engine} 扩展。`,
    sync: '登录状态', syncCloud: '保存至 Folio，随环境同步', syncLocal: '仅保存在使用该环境的电脑上',
    syncHelp: '仅存本机时，登录状态不会离开该电脑；在其他电脑上打开时为未登录状态。',
    stale: '编辑期间该环境已被他人修改。再次保存将覆盖对方的修改，取消则保留对方的修改。'
  },
  browser: {
    title: '浏览器', search: '搜索引擎', name: zhSearch,
    restore: '恢复上次的标签页',
    start: '打开时', startTabs: '恢复上次的标签页', startHome: (name: string) => `打开${name}首页`, startBlank: '打开空白页',
    bulk: '浏览器设置…', on: '开启', off: '关闭',
    searchSet: (n: number, name: string) => `已将 ${n} 个环境的搜索引擎设为${name}`,
    tabsSet: (n: number, on: boolean) => `已为 ${n} 个环境${on ? '开启' : '关闭'}恢复标签页`
  },
  importer: {
    title: '导入环境', lead: '每行一个环境，首行为表头。Excel 表格请先另存为 CSV；每次最多 500 行。',
    columns: '列：name 或 名称（必填）、group 分组、tags 标签（用 | 分隔）、os 系统（windows、macos、linux）、engine 内核（chromium、firefox）、proxy 代理、timezone 时区、language 语言、搜索引擎（google、bing、baidu、duckduckgo、yahoo、yandex 或 none）、恢复标签页（是或否）、notes 备注、cookies（JSON 或 cookies.txt 文本）。',
    example: '填入示例', file: '选择文件…', pasteLabel: 'CSV', ready: (n: number) => `${n} 个环境可导入。`,
    problems: '请先修正以下行：', row: (n: number) => `第 ${n} 行`, header: '首行须包含「name」或「名称」列。',
    errs: { name: '名称为空或太长', os: '无法识别的系统', engine: '无法识别的内核', tags: '最多 10 个标签，每个不超过 24 个字', timezone: '无法识别的时区', language: '不是有效的语言代码', proxy: '代理地址无法识别', cookies: '无法读取 Cookie', search: '无法识别的搜索引擎', restoreTabs: '请填写「是」或「否」', header: '' },
    tooMany: '每次最多 500 行。', room: (free: number) => `套餐剩余 ${free} 个环境额度。`, firefox: '部分行使用 Firefox，请先下载 Firefox 内核。',
    submit: (n: number) => `导入 ${n} 个环境`, steps: { proxies: '正在添加代理…', groups: '正在创建分组…', fingerprints: (i: number, n: number) => `正在生成指纹… ${i} / ${n}`, saving: '正在保存…', cookies: (i: number, n: number) => `正在导入 Cookie… ${i} / ${n}` },
    done: (n: number) => `已导入 ${n} 个环境`
  },
  proxies: {
    title: '代理',
    search: '搜索代理', searchPh: '搜索名称、地址或城市', add: '添加代理', import: '导入', checkAll: '全部检测',
    sum: { total: '代理总数', ok: '连接正常', issues: '连接异常', unbound: '未绑定' },
    filter: { type: '协议', types: '全部协议', region: '地区', regions: '全部地区', state: '状态', states: '全部状态' },
    cols: { name: '代理名称', type: '协议', address: '代理地址', exit: '出口地区', status: '状态', latency: '延迟', profiles: '绑定环境', actions: '操作' },
    labels: { latency: '延迟', uptime: '可用率', profiles: '环境' }, backupOf: (n: string) => `备用 ${n}`, noExit: '出口未知',
    downNote: (n: number, when: string | null) => `连续 ${n} 次无响应${when ? ` · 最后正常于${when}` : ''}`,
    states: { ok: '正常', slow: '较慢', down: '无响应', unchecked: '未检测', issues: '异常', unbound: '未绑定' },
    history: (n: number) => `最近 ${n} 次检测`, never: '未检测',
    empty: '暂无代理。可逐个添加，或导入代理商提供的列表。',
    bulkCheck: '检测', bulkDelete: '删除', confirmDelete: (n: number) => `删除 ${n} 个代理？`, confirmNote: '使用这些代理的环境将保留，并改为不使用代理。',
    deleted: (n: number) => `已删除 ${n} 个代理`, checked: (n: number) => `已检测 ${n} 个代理`, actionsX: (n: string) => `${n} 的操作`,
    detail: {
      label: '代理详情', exitIp: '出口 IP', region: '地区', latency: '当前延迟', profiles: '绑定环境', config: '连接配置', history: '最近检测记录',
      ok: (ms: number) => `连接正常 · ${ms} ms`, failed: '连接失败', passSet: '已保存', passNone: '未设置', uptime: '可用率',
      uptimeOf: (pct: number, n: number) => `${pct}%（最近 ${n} 次）`, bound: (n: number) => `绑定环境（${n}）`, showAll: '在环境列表中查看',
      none: '暂无环境使用此代理。', noHistory: '尚未检测。'
    },
    formAdd: '添加代理', formEdit: '编辑代理', name: '代理名称', namePh: '默认为 地址:端口', type: '代理协议', host: '代理地址', port: '端口',
    auth: '身份验证', user: '用户名', pass: '密码', passKeep: '已保存，留空则不修改。', reveal: '显示', conceal: '隐藏',
    test: '检测连接', testOk: '连接正常', testBad: '连接失败', why: { timeout: '连接超时', unreachable: '无法连接' } as Record<string, string>,
    addMore: '保存后继续添加',
    backup: '备用线路', backupNone: '无', backupHint: '该线路无响应时自动切换至备用线路。',
    hostErr: '请填写主机名或 IP 地址。', portErr: '端口范围是 1 到 65535。',
    importTitle: '导入代理', importLead: '每行一个，支持以下格式：', defaultType: '未注明类型的行按此类型处理',
    importBtn: '导入', imported: (added: number, known: number) => `新增 ${added} 个代理${known ? `，${known} 个已存在` : ''}`,
    badLines: '以下行无法识别：', line: (n: number) => `第 ${n} 行`
  },
  trash: {
    title: '回收站', empty: '回收站为空。',
    restore: '恢复', restoreAll: '全部恢复', purge: '彻底删除', purgeAll: '清空回收站',
    cols: { profile: '环境', fingerprint: '指纹', signins: '登录状态', deleted: '删除时间', by: '删除人' },
    sites: (n: number) => (n ? `${n} 个站点` : '无'), byAt: (who: string, when: string) => `${who} 删除于 ${when}`,
    confirmPurge: (n: number) => `彻底删除 ${n} 个环境？`, confirmNote: '其指纹与设置将无法恢复。',
    restored: (n: number) => `已恢复 ${n} 个环境`, purged: (n: number) => `已彻底删除 ${n} 个环境`
  },
  engines: {
    title: '内核',
    cols: { version: '内核版本', platforms: '支持平台', size: '大小', released: '发布日期', profiles: '使用环境', status: '状态', actions: '操作' },
    recommended: '推荐', installed: '已下载', notDownloaded: '未下载', download: (size: string) => `下载 · ${size}`, failed: '下载失败',
    downloadingPct: (pct: number) => `下载中 ${pct}%`, everywhere: (n: number) => `全平台 ${n} 个`, actionsX: (v: string) => `${v} 的操作`,
    remove: '删除本机文件', removeBusy: '请先关闭使用该版本的环境。', removed: (v: string) => `已从本机删除 ${v}`,
    retired: '已从目录下架', none: '该内核暂无适用于本机系统的版本。',
    outdated: (n: number, kernel: string) => `${n} 个环境使用旧版本 ${kernel}`, upgrade: (v: string) => `升级到 ${v}`,
    upgradeNote: (v: string) => `升级到推荐的 ${v} 后，网站看到的指纹保持不变。`,
    paused: (pct: number) => `已暂停 · ${pct}%`, pause: '暂停', resume: '继续',
    disk: (size: string) => `本机内核共占用 ${size}`, cleanup: '清理未使用的版本', nothingToClean: '已下载的版本均在使用中或为推荐版本。',
    cleanupTitle: (n: number) => `清理 ${n} 个未使用的版本？`, cleanupNote: (size: string) => `可释放 ${size}，环境需要时将重新下载。`,
    cleaned: (n: number) => `已从本机删除 ${n} 个版本`,
    settings: '下载设置', autoDownload: '自动下载推荐版本',
    idleOnly: '只在空闲时下载',
    upgraded: (n: number, v: string) => `已将 ${n} 个环境升级到 ${v}`,
    platforms: { 'win32-x64': 'Windows', 'darwin-arm64': 'macOS · Apple 芯片', 'darwin-x64': 'macOS · Intel', 'linux-x64': 'Linux' } as Record<string, string>,
    admin: {
      upload: '上传新版本', title: '上传内核版本', kind: '内核', version: '版本号', versionPh: '如 151.0.7900.10', platform: '系统',
      file: '安装包', choose: '选择文件…', fileHint: '内核发布的原始安装包：.zip、.tar.xz 或 .dmg，直接上传至 Folio 存储。',
      hashing: (pct: number) => `正在校验文件… ${pct}%`, uploading: (pct: number) => `正在上传… ${pct}%`, send: '上传', done: (v: string) => `已将 ${v} 加入目录`,
      recommend: '设为推荐', recommended: (v: string) => `已将 ${v} 设为推荐版本`, retire: '下架', unfinished: '上传未完成',
      recommendTitle: (v: string) => `将 ${v} 设为推荐版本？`, recommendNote: '新建环境将默认使用该版本，下方说明将显示在该版本所在行。', note: '更新说明（可选）',
      retireTitle: (v: string) => `下架 ${v}？`,
      retireConfirm: (n: number) => `${n ? `全平台 ${n} 个环境在用。` : ''}已下载的电脑可继续使用，其他电脑上的相关环境需改用其他版本。`,
      retiredDone: (v: string) => `已下架 ${v}`
    }
  },
  team: {
    title: '团队',
    invite: '邀请成员', you: '我', remove: '移出团队', leave: '退出团队',
    tabs: { members: '团队成员', groups: '分组授权' },
    cols: { person: '成员', role: '角色', scope: '权限范围', status: '状态' },
    scopeAll: '全部环境', scopeOwn: '分配给自己的环境', joined: '已加入', invited: '待接受',
    search: '搜索成员', meTag: '（我）', moreX: (e: string) => `${e} 的更多操作`, roleOf: (e: string) => `${e} 的角色`,
    groupSum: (people: number, n: number) => `${people} 人 · ${n} 个环境`,
    copiedNew: '已复制新的邀请链接，原链接已失效。',
    roleHelp: { admin: '可查看和管理全部环境、代理与成员。', member: '仅可查看和打开分配给自己的环境；可新建和编辑，不可删除。', viewer: '仅可查看已授权的内容，不能做任何修改。' } as Record<string, string>,
    roleActions: (n: number) => `${n} 项权限`,
    expires: (date: string) => `${date} 过期`,
    copyLink: '复制链接', copied: '邀请链接已复制', resend: '重新发送', withdraw: '撤回', withdrawn: '邀请已撤回',
    inviteTitle: '邀请加入团队', email: '邮箱', emailErr: '请填写邮箱地址。', role: '角色',
    send: '发送邀请', sent: (e: string) => `邀请已发送到 ${e}。`, notSent: '邮件发送失败，请复制链接发送给对方。',
    link: '邀请链接', done: '完成',
    removeTitle: (e: string) => `移除 ${e}`, removeLead: '其名下环境将转交给指定人员；其电脑上已打开的环境将被关闭，本地数据将被删除。',
    heir: '环境转交给', removeDo: '移出团队', removed: (e: string) => `已移除 ${e}`,
    leaveTitle: (ws: string) => `退出「${ws}」？`, leaveLead: '您在此团队的环境将转交给所有者，此后将无法访问该团队。', leaveDo: '退出',
    removedYou: (ws: string) => `您已不在「${ws}」中，其环境已在本机关闭并删除。`,
    groupAccess: '分组授权', groupAccessNone: '尚未建立分组，请在分组页新建。',
    groupMembers: '可访问该分组的成员', groupInherits: '若未关闭继承，该分组同时允许其上级分组的成员访问。',
    invites: '收到的邀请', join: '加入', decline: '拒绝', from: (who: string, role: string) => `${who} 邀请您成为${role}`
  },
  activity: {
    title: '操作日志', person: '成员', everyone: '所有人', kind: '显示',
    search: '搜索环境、成员或操作', cols: { time: '时间', person: '成员', what: '操作', kind: '类别', device: '电脑' },
    kinds: { all: '全部', open: '打开与关闭', profiles: '环境改动', trash: '回收站', proxies: '代理与分组', cookies: 'Cookie 与导出', team: '团队', extensions: '扩展', automation: '自动化' },
    export: '导出 CSV', exported: (path: string) => `已保存到 ${path}`, more: '查看更早的', empty: '暂无记录。', someone: '有人', recent: '最近活动',
    today: '今天', yesterday: '昨天', on: (device: string) => `在 ${device} 上`,
    actions: {
      'profile.create': p => `创建了 ${p}`, 'profile.update': (p, x) => `修改了 ${p} 的${x.fields?.map((f: string) => zhFields[f] ?? f).join('、')}`,
      'profile.move': (p, x) => (x.group ? `将 ${p} 移至「${x.group}」` : `将 ${p} 移出分组`), 'profile.tag': (p, x) => `为 ${p} 添加标签「${x.tag}」`,
      'profile.untag': (p, x) => `移除 ${p} 的标签「${x.tag}」`, 'profile.set-proxy': (p, x) => (x.proxy ? `将 ${p} 的代理更换为 ${x.proxy}` : `移除 ${p} 的代理`),
      'profile.assign': (p, x) => (x.to ? `将 ${p} 分配给 ${x.to}` : `取消 ${p} 的负责人`),
      'profile.trash': p => `将 ${p} 移至回收站`, 'profile.restore': p => `恢复了 ${p}`, 'profile.purge': p => `彻底删除了 ${p}`,
      'profile.open': (p, x) => (x.via === 'api' ? `通过 API 打开了 ${p}` : `打开了 ${p}`), 'profile.close': p => `关闭了 ${p}`, 'profile.takeover': (p, x) => `从 ${x.from ?? '另一台电脑'} 收回了 ${p}`,
      'proxy.create': (_p, x) => `添加了代理 ${x.name}`, 'proxy.import': (_p, x) => `导入了 ${x.added} 个代理`,
      'proxy.update': (_p, x) => `修改了代理 ${x.name}`, 'proxy.delete': (_p, x) => `删除了代理 ${x.name}`,
      'group.members': (_p, x) => `调整了分组「${x.name}」的授权成员`,
      'group.create': (_p, x) => `创建了分组「${x.name}」`, 'group.rename': (_p, x) => `将分组「${x.from}」重命名为「${x.name}」`, 'group.delete': (_p, x) => `删除了分组「${x.name}」`,
      'member.invite': (_p, x) => `邀请 ${x.email} 成为${x.role}`, 'member.join': (_p, x) => `以${x.role}身份加入`,
      'member.role': (_p, x) => `将 ${x.email} 设为${x.role}`, 'member.remove': (_p, x) => `移除了 ${x.email}，其环境已转交 ${x.to}`,
      'member.leave': () => '退出了团队', 'invitation.withdraw': (_p, x) => `撤回了给 ${x.email} 的邀请`,
      'role.create': (_p, x) => `新建了角色「${x.name}」`, 'role.update': (_p, x) => `调整了角色「${x.name}」的权限`, 'role.delete': (_p, x) => `删除了角色「${x.name}」`,
      'cookies.export': (p, x) => `导出了 ${p} 的 ${x.count} 个 Cookie`, 'cookies.import': (p, x) => `向 ${p} 导入了 ${x.count} 个 Cookie`,
      'workspace.export': (_p, x) => `导出了全部数据（${x.profiles} 个环境、${x.proxies} 个代理）`,
      'workspace.import': (_p, x) => `导入了 ${x.profiles} 个环境，新增 ${x.proxies} 个代理和 ${x.groups} 个分组`,
      'flow.create': (_p, x) => `新建了流程 ${x.name}`, 'flow.update': (_p, x) => (x.from ? `将流程 ${x.from} 重命名为 ${x.name}` : `修改了流程 ${x.name}`),
      'flow.delete': (_p, x) => `删除了流程 ${x.name}`,
      'task.create': (_p, x) => `新建了任务 ${x.name}`, 'task.update': (_p, x) => (x.from ? `将任务 ${x.from} 重命名为 ${x.name}` : `修改了任务 ${x.name}`),
      'task.delete': (_p, x) => `删除了任务 ${x.name}`, 'run.start': (_p, x) => `${x.trigger === 'rerun' ? '重新运行' : '运行'}了任务 ${x.name}，共 ${x.profiles} 个环境`,
      'run.finish': (_p, x) => `任务 ${x.name} ${x.status === 'stopped' ? '已停止' : '已完成'}：${x.ok} 个成功，${x.failed} 个失败${x.signedOut ? `，${x.signedOut} 个掉线` : ''}${x.skipped ? `，${x.skipped} 个未运行` : ''}`,
      'extension.add': (_p, x) => `添加了扩展 ${x.name} ${x.version}`, 'extension.update': (_p, x) => `将扩展 ${x.name} 从 ${x.from} 更新至 ${x.version}`,
      'extension.delete': (_p, x) => `删除了扩展 ${x.name}`, 'profile.add-extension': (p, x) => `为 ${p} 安装了 ${x.extension}`, 'profile.remove-extension': (p, x) => `从 ${p} 卸载了 ${x.extension}`,
      'profile.set-kernel': (p, x) => `将 ${p} 的内核版本改为 ${x.kernel === 'firefox' ? 'Firefox' : 'Chromium'} ${x.version}`,
      'profile.set-browser': (p, x) => (x.searchEngine ? `将 ${p} 的搜索引擎设为${zhSearch(x.searchEngine)}` : `为 ${p} ${x.restoreTabs ? '开启' : '关闭'}了恢复标签页`)
    }
  },
  transfer: {
    exportTitle: '导出全部数据', exportLead: '导出文件包含全部环境（指纹与设置）、登录状态、分组以及含密码的代理。回收站中的环境不导出。',
    passphrase: '口令', confirm: '确认口令', passHelp: '至少 10 位。文件仅能用此口令打开，口令不会被保存；遗忘口令将无法打开文件。',
    passShort: '口令至少 10 位。', passMismatch: '两次输入的口令不一致。', export: '导出', exporting: '正在导出…', exported: (path: string) => `已保存到 ${path}`,
    importTitle: '导入数据', importLead: '将 .folio 文件导入当前团队：环境将新增并重新编号，相同的代理与同名分组将复用。',
    choose: '选择 .folio 文件…', unlock: '解锁', unlocking: '正在解锁…',
    preview: (p: { workspace: string; profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }) => `来自「${p.workspace}」：${p.profiles} 个环境（${p.signedIn} 个含登录状态）、${p.proxies} 个代理、${p.groups} 个分组${p.extensions ? `、${p.extensions} 个扩展` : ''}。`,
    room: (free: number) => `套餐剩余 ${free} 个环境额度。`, import: '导入', importing: '正在导入…',
    imported: (r: { profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }) => `已导入 ${r.profiles} 个环境（${r.signedIn} 个含登录状态），新增 ${r.proxies} 个代理、${r.groups} 个分组${r.extensions ? `、${r.extensions} 个扩展` : ''}`
  },
  flows: {
    title: '流程', new: '新建流程',
    template: '登录检查模板', templateName: '登录检查',
    cols: { name: '流程', steps: '步骤', by: '创建人', updated: '修改时间' },
    empty: '暂无流程。流程由一系列步骤组成（打开网页、点击、输入、提取等），可在一个或多个环境中运行。',
    you: '我', view: '查看', duplicate: '复制', duplicateToEdit: '复制后修改', delete: '删除', deleteX: (n: string) => `删除 ${n}`,
    inUse: (tasks: string) => `正被 ${tasks} 使用，无法删除。`, confirmDelete: (n: string) => `删除「${n}」？`, deleted: (n: string) => `已删除 ${n}`, copyName: (n: string) => `${n}（副本）`, untitled: '新流程',
    back: '流程', backLabel: '返回流程列表', name: '流程名称', nameNeeded: '请填写流程名称。', save: '保存', saving: '正在保存…', saved: '流程已保存',
    leave: '修改尚未保存，确定离开？', keepEditing: '继续编辑', discard: '放弃修改',
    readOnly: '仅流程创建者、管理员和所有者可修改，可复制一份后修改。',
    stale: '编辑期间该流程已被他人保存。再次保存将以当前版本覆盖对方的修改。',
    issues: (n: number) => `尚有 ${n} 个步骤未填写完整，完成后方可保存。`,
    steps: '步骤', noSteps: '暂无步骤。', add: '添加步骤',
    groups: { page: '页面操作', data: '数据', logic: '逻辑', other: '其他' },
    about: {
      open: '打开指定网址', click: '点击页面元素', type: '在输入框中输入文本', press: '按下按键或组合键', wait: '等待一段时间或等待元素出现',
      scroll: '滚动页面或滚动至元素', extract: '读取文本或属性并存入变量', set: '为变量赋值', screenshot: '截取整页或单个元素',
      signedIn: '未登录时停止执行', if: '满足条件时执行指定步骤', loop: '重复执行，或逐个元素执行', script: '在页面中执行 JavaScript'
    } satisfies Record<Step['type'], string>,
    start: { title: '流程由步骤组成', body: '按顺序完成手动操作：打开页面、点击、输入、读取内容。从菜单中添加步骤，再在右侧选择环境试运行。', template: '从登录检查模板开始' },
    types: { open: '打开网址', click: '点击', type: '输入', press: '按键', wait: '等待', scroll: '滚动', extract: '提取', set: '设置变量', if: '条件判断', loop: '循环', screenshot: '截图', script: '执行脚本', signedIn: '确认已登录' } satisfies Record<Step['type'], string>,
    up: (p: string) => `第 ${p} 步上移`, down: (p: string) => `第 ${p} 步下移`, copyStep: (p: string) => `复制第 ${p} 步`, remove: (p: string) => `删除第 ${p} 步`,
    then: '满足时', else: '否则', each: '每一次', end: '结束',
    settings: '步骤设置', pick: '在流程图中选择步骤后即可修改。', stepN: (p: string) => `第 ${p} 步`, upToDate: '已保存',
    zoomIn: '放大', zoomOut: '缩小',
    sum: {
      secs: (a: number, b: number | null) => (b ? `${a}–${b} 秒` : `${a} 秒`), until: (what: string, sel: string, s: number) => `${what} ${sel} · 最多 ${s} 秒`,
      pixels: (n: number) => `${n} 像素`, into: (sel: string, what: string, v: string) => `${sel} 的${what} → {{${v}}}`,
      contains: (sel: string, t: string) => `${sel} 包含「${t}」`, exists: (sel: string) => `存在 ${sel}`,
      times: (n: number) => `${n} 次`, each: (sel: string) => `每个 ${sel}`, empty: '尚未填写'
    },
    issue: { url: '请填写网址。', selector: '请指定元素。', key: '请填写按键。', variable: '变量名仅可包含字母、数字和下划线，且不能以数字开头。', pixels: '请填写滚动距离。', times: '至少重复一次。', code: '请填写脚本。', attribute: '请填写属性名。' },
    f: {
      selector: '元素', selectorPh: '#login、.price、text=登录', variable: '变量', url: '网址', text: '文字', slow: '逐字输入，模拟真人打字',
      key: '按键', until: '等待', untilTime: '一段时间', untilVisible: '元素出现', untilHidden: '元素消失',
      seconds: '秒数', maxSeconds: '最多（随机）', optional: '可不填', limit: '最多等（秒）',
      to: '滚动', toElement: '滚到元素', toPixels: '滚动若干像素', toBottom: '滚到底', pixels: '像素（负数向上）',
      take: '取', takeText: '文字', takeAttr: '属性', attribute: '属性名', into: '存入变量', value: '值',
      shot: '截取', shotPage: '整页', shotElement: '某个元素', code: 'JavaScript', result: '返回值存入',
      scriptHint: '在网页中执行，使用 return 返回结果。Firefox 环境中脚本默认无法读取网页自身的 JavaScript 变量，如需读取，请在开头加 mw:。',
      test: '条件', exists: '某个元素存在', contains: '某个元素的文字包含', equals: '某个变量等于',
      repeat: '重复', repeatTimes: '固定次数', repeatEach: '对每个匹配的元素', times: '次数',
      eachHint: '里面的步骤可以用 @item 指代当前元素（@item >> a 表示在它里面找），{{loop.index}} 从 1 开始计数。', timesHint: '里面的步骤可以用 {{loop.index}}，从 1 开始计数。',
      signedBy: '登录判定条件', signedPresent: '存在该元素', signedAbsent: '不存在该元素',
      signedHint: '例如仅登录后显示的头像、账户菜单，或仅未登录时显示的「登录」按钮。判定为掉线时，该环境停止运行；在任务中运行时将发送桌面通知。'
    },
    trial: {
      title: '试运行', lead: '使用编辑器中的当前步骤（无需先保存），在环境的新标签页中运行一遍，完成后浏览器保持打开。',
      profile: '运行环境', noProfiles: '暂无环境', vars: '本次运行的变量（名称=值，每行一个）', run: '运行', stop: '停止', log: '日志',
      ms: (n: number) => (n < 1000 ? `${n} 毫秒` : `${(n / 1000).toFixed(1)} 秒`), times: (n: number) => `${n} 次`,
      ok: '运行完成。', signedOut: '检测到该环境已掉线。', notOpened: (why: string) => `环境未能打开：${why}`, failed: (why: string) => `运行在出错步骤处停止：${why}`, shot: (name: string) => `查看 ${name}`
    },
    errors: {
      timeout: '超时：元素未出现，或网页未加载完成。', navigation: '网页无法打开。', script: '脚本执行出错。',
      variable: (name: string) => `{{${name}}} 未赋值。`, no_item: '@item 仅可用于「对每个匹配的元素」循环中。',
      closed: '浏览器或标签页已关闭。', stopped: '已停止。', failed: '该步骤执行失败。',
      too_long: (min: string) => `超出任务设定的 ${min} 分钟。`, signed_out: '已掉线。'
    }
  },
  tasks: {
    title: '定时任务', new: '新建任务', needFlow: '请先在「流程」页创建流程。',
    empty: '暂无任务。任务将流程分批运行在一组环境上，并保留每次运行的结果。',
    cols: { task: '任务', profiles: '环境', when: '时间', last: '上次运行', on: '运行在', by: '创建人', profile: '环境', status: '结果', attempts: '尝试', time: '用时', result: '详情' },
    views: { label: '视图', list: '列表', calendar: '日历' },
    here: '本机', starter: '启动者的电脑', n: (n: number) => `${n} 个`,
    latest: (task: string) => `最近一次运行 · ${task}`, took: (s: number) => (s < 60 ? `用时 ${s} 秒` : `用时 ${Math.floor(s / 60)} 分 ${s % 60} 秒`),
    calendar: {
      prev: '上一周', next: '下一周', thisWeek: '本周', none: '本周没有定时运行。',
      range: (a: Date, b: Date) => `${a.getFullYear()}年${a.getMonth() + 1}月${a.getDate()}日 – ${a.getMonth() === b.getMonth() ? '' : `${b.getMonth() + 1}月`}${b.getDate()}日`,
      at: (time: string, n: number) => `${time} · ${n} 个`
    },
    never: '尚未运行', manual: '手动', next: (at: string) => `下次：${at}`, done: '时间已过', on: (device: string) => `在 ${device} 上运行`,
    once: (at: string) => `一次：${at}`, everyDay: '每天', weekdays: '工作日', weekends: '周末', dayNames: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    onlyOpen: '定时任务在其所属电脑上运行，需该电脑的 Folio 处于运行并已登录状态；错过的执行时间将被记录，不会自动补运行。', enableStartup: '开机自动启动 Folio',
    run: '运行', runX: (n: string) => `运行 ${n}`, stop: '停止', delete: '删除', deleteX: (n: string) => `删除 ${n}`,
    noProfilesHere: '无可运行的环境。', runningElsewhere: '任务正在运行。',
    confirmDelete: (n: string) => `删除「${n}」及其运行记录？`, deleted: (n: string) => `已删除 ${n}`, started: (n: string) => `${n} 已在本机开始运行`,
    saved: '任务已保存', stale: '编辑期间该任务已被他人修改，请重新打开后再编辑。',
    status: { running: '运行中', done: '已完成', stopped: '已停止', interrupted: '已中断', missed: '错过', busy: '跳过' },
    progress: (done: number, all: number) => `已完成 ${done} / ${all}`, elsewhere: (where: string) => `在 ${where} 上`,
    counts: (c: { ok: number; failed: number; signed_out: number; skipped: number; canceled: number }) => [c.ok && `${c.ok} 个成功`, c.signed_out && `${c.signed_out} 个掉线`, c.failed && `${c.failed} 个失败`, c.skipped && `${c.skipped} 个跳过`, c.canceled && `${c.canceled} 个未运行`].filter(Boolean).join(' · ') || '均未运行',
    back: '任务', backLabel: '返回任务列表', about: (flow: string, n: number, conc: number, retries: number) => `${flow} · ${n} 个环境 · 同时 ${conc} 个 · ${retries === 0 ? '不重试' : `失败重试 ${retries} 次`}`,
    runs: '运行记录', noRuns: '暂无运行记录。', triggers: { manual: '手动', rerun: '重新运行', schedule: '定时' }, result: '运行结果',
    missedNote: (at: string, device: string) => `${at} 未运行：${device || '所属电脑'}上的 Folio 未运行或未登录，或电脑处于睡眠状态。`,
    busyNote: (at: string) => `${at} 未运行：上一轮尚未完成。`, runNow: '补运行',
    startedBy: (who: string, device: string | null, when: string) => `${who}${device ? `，在 ${device} 上` : ''}，${when}`,
    rerun: (n: number) => `重新运行未成功的 ${n} 个环境`, export: '导出 CSV', exported: (path: string) => `已保存到 ${path}`,
    csv: { number: '编号', profile: '环境', status: '结果', attempts: '尝试次数', problem: '问题' },
    item: { pending: '等待中', running: '运行中', ok: '成功', failed: '失败', signed_out: '已掉线', skipped: '跳过', canceled: '未运行' },
    noLog: '暂无日志。', attempt: (n: number) => `第 ${n} 次尝试`, shotsWhere: (device: string) => (device ? `截图保存在 ${device} 上。` : '截图保存在运行该任务的电脑上。'),
    skip: { locked: '正在另一台电脑上使用。', not_found: '该环境已不存在。', in_trash: '该环境位于回收站中。', forbidden: '已无权访问该环境。', scripted: '当时正由脚本通过本机 API 控制。' } as Record<string, string>,
    form: {
      newTitle: '新建任务', editTitle: '编辑任务', create: '创建任务', save: '保存修改', name: '名称', flow: '流程',
      profiles: (n: number) => `环境 · 已选 ${n} 个`, search: '搜索环境', all: '全选筛选结果', none: '无匹配环境。',
      concurrency: '同时运行', retries: '失败时', retriesN: (n: number) => (n === 0 ? '不重试' : `最多重试 ${n} 次`),
      timeout: '每个环境最长', minutes: (n: number) => `${n} 分钟`,
      memory: '每个已打开的环境约占用 300–500 MB 内存，请根据电脑配置设置并发数。',
      when: '何时运行', kinds: { none: '手动', once: '一次', daily: '每天' }, at: '日期和时间', time: '时间', days: '星期',
      runsHere: '在本机运行，按本机时间执行。', runsOn: (device: string, email: string) => `在 ${device}（${email}）上运行，按该电脑时间执行。`,
      moveHere: '改为在本机运行', scheduleHelp: '需该电脑的 Folio 处于运行并已登录状态；错过的执行时间将被记录，可在记录中补运行。',
      vars: '按环境设置的变量', varsHelp: '选填。上传表格：首列为环境（名称或编号），其余每列为一个变量，在流程中以 {{列名}} 引用。变量加密保存，仅可编辑该任务的成员可见。',
      varsStored: (n: number, names: string) => `已为 ${n} 个环境设置：${names}`, varsCleared: '保存后将删除这些变量。',
      varsReplace: '重新导入…', varsClear: '删除', varsKeep: '保留现有变量',
      varsReady: (n: number, names: string) => `${n} 个环境的 ${names}。`,
      varErrs: { header: '首行须包含环境列和至少一个变量', variable: '变量名仅可包含字母、数字和下划线', profile: '不在已选环境中', repeat: '该环境在前面的行中已出现' }
    }
  },
  apiPage: {
    title: 'API 与脚本', reference: 'API 参考',
    server: '本机 API', enable: '开启', listening: '正在监听', off: '已关闭。开启后本机脚本方可调用。', copy: '复制', copied: '已复制',
    errors: { port_in_use: '该端口已被其他程序占用，请更换端口。', listen_failed: '该端口启动失败，请更换端口。' },
    port: '端口', limit: '每分钟最多 60 次请求（含打开、关闭与查询），脚本直接发送给浏览器的指令不计入；公司版不限速。',
    unthrottled: '公司版：请求不限速。',
    security: '调试地址没有密码保护：通过 API 打开的环境运行期间，本机任何程序均可控制该环境。手动打开的环境不开启调试地址。',
    tokens: '令牌',
    newToken: '请立即复制该令牌，关闭后将不再显示。', done: '完成', tokenName: '名称，例如订单同步', createToken: '生成令牌', defaultName: '令牌',
    made: (date: string) => `${date} 生成`, used: (date: string) => `最后使用于 ${date}`, unused: '尚未使用', revoke: '作废', revokeX: (n: string) => `作废 ${n}`, otherWorkspace: '另一个团队',
    examples: '示例', exampleNames: { playwright: 'Playwright', puppeteer: 'Puppeteer', selenium: 'Selenium', firefox: 'Firefox 环境' },
    copyAddress: '复制地址', limited: '超出限额',
    placeholder: '请将 <token> 替换为您的令牌；令牌仅在生成时显示一次。',
    calls: '最近调用', noCalls: '暂无脚本调用，调用发生时将在此实时显示。', noToken: '令牌无效'
  },
  extensions: {
    title: '扩展', add: '添加扩展',
    memberNote: '扩展库由所有者和管理员维护。成员可在环境编辑或批量操作中，为自己的环境安装库中的扩展。',
    empty: '暂无扩展。可从文件或商店添加，再安装到环境中。',
    cols: { name: '扩展', engine: '内核', version: '版本', signature: '签名', profiles: '环境', updated: '修改时间' },
    search: '搜索扩展', noMatch: '无符合条件的扩展。', inProfiles: (n: number) => `${n} 个环境`,
    install: '安装到环境…', installTitle: (n: string) => `将 ${n} 安装到环境`, installMany: (n: number) => `将 ${n} 个扩展安装到环境`,
    installDo: (n: number) => (n ? `安装到 ${n} 个环境` : '安装'), installedHere: '已安装', noProfiles: '暂无该内核的环境。',
    deleteNote: '相关环境可继续使用，之后可重新添加。',
    uploaded: '上传的文件', update: '新版本', delete: '删除', deleteX: (n: string) => `删除 ${n}`,
    signed: '签名已校验', signedNote: '安装到环境前，Folio 都会核对安装包的签名与校验值，任一不符即不予安装。',
    confirmDelete: (n: string, count: number) => (count ? `删除「${n}」？将从 ${count} 个环境中卸载。` : `删除「${n}」？`),
    deleted: (n: string) => `已删除 ${n}`, added: (n: string) => `已将 ${n} 加入扩展库`, updated: (n: string) => `${n} 已更新，环境下次打开时启用新版本`,
    addTitle: '添加扩展', updateTitle: (n: string) => `${n} 的新版本`, from: '来源', fromFile: '文件', fromStore: (k: string) => (k === 'chromium' ? 'Chrome 应用商店' : 'addons.mozilla.org'),
    chooseFile: '选择文件…', fileHintChromium: '.crx 或 .zip，顶层须包含 manifest.json。', fileHintFirefox: '.xpi 或 .zip，顶层须包含 manifest.json。',
    storeChromium: '商店链接或扩展 ID', storeFirefox: '附加组件链接（或短名称）',
    idNote: 'Folio 为扩展配置独立密钥，使其在各台电脑上的 ID 一致，扩展数据可随环境同步。因此其 ID 与商店版本不同，少数需与本机程序或网站配对的扩展可能依赖原 ID。',
    uuidNote: '每个环境为该附加组件分配不同的内部地址，网站无法借此关联不同环境。',
    addDo: '添加', updateDo: '上传', uploading: '正在上传…', fetching: '正在从商店下载…',
    failedCheck: (profile: string, names: string[]) => `${profile} 已打开，但 ${names.join('、')} 未通过完整性校验，未安装。`
  },
  windowSync: {
    title: '窗口同步', on: '窗口同步已开启。', onBadge: '开启',
    summary: (leader: string, n: number) => `${leader} 主控，${n} 个窗口跟随。`,
    leaderTag: '主控', followerTag: '同步', makeLeader: '设为主控', stop: '停止同步', current: '同步中',
    address: '所有窗口一起打开的网址', addressPh: '在所有窗口中打开网址', open: '打开',
    pick: '选择窗口',
    running: '已打开', start: (n: number) => (n < 2 ? '至少选择两个' : `同步 ${n} 个窗口`), starting: '正在启动…',
    ops: { label: '同步', click: '点击', typing: '输入', scroll: '滚动' },
    delay: '随机延迟', seconds: '秒', delayMin: '最短延迟（秒）', delayMax: '最长延迟（秒）',
    synced: (n: number, bad: number) => `已同步 ${n} 个窗口${bad ? ` · ${bad} 个出错` : ''}`,
    workHere: '在此操作', inSync: '同步中', shotWait: '正在获取窗口画面…',
    notFound: (label: string | null) => (label ? `未找到「${label}」` : '未找到元素'), failed: '同步失败',
    issues: {
      coords: (label: string | null) => `${label ? `未找到「${label}」` : '未找到主控点击的元素'}，已在窗口相同位置点击。`,
      failed: () => '部分操作未能同步执行，请检查该窗口。'
    },
    log: '最近同步', logEmpty: '主控窗口中的操作将记录在此。',
    did: {
      click: (label: string | null) => (label ? `点击「${label}」` : '点击'), text: (t: string) => `输入「${t}」`, key: (k: string) => `按键 ${k}`,
      scroll: (px: number) => `滚动至 ${px} 像素`, goto: (url: string) => `打开 ${url}`,
      tab: { open: (n: number) => `新建第 ${n} 个标签页`, close: (n: number) => `关闭第 ${n} 个标签页`, switch: (n: number) => `切换至第 ${n} 个标签页` }
    },
    upgrade: '窗口同步属于工作室版和公司版。',
    upsell: {
      title: '一次操作，多窗口同步完成', lead: '指定一个主控窗口，其中的点击、输入、按键、滚动、地址与标签页操作实时同步到其他窗口。',
      points: ['所有环境同时打开同一页面', '一次填写，多个店铺的同一表单同步完成', '一键平铺全部窗口'],
      ask: '请联系团队所有者或管理员升级。'
    },
    tile: '一键平铺', tiling: '正在排列…',
    tiled: (moved: number, total: number) => (moved === total ? `已将 ${total} 个窗口平铺排列。` : `已排列 ${moved}/${total} 个窗口。`),
    tileMissed: {
      unsupported: 'Linux 不支持移动 Firefox 窗口。',
      permission: '如需移动 Firefox 窗口，请在「系统设置 › 隐私与安全性 › 辅助功能」中允许 Folio（系统询问时，同时在「自动化」中允许），然后重新平铺。',
      failed: '其余窗口移动失败。'
    }
  },
  palette: {
    title: '命令面板', placeholder: '搜索环境、页面或操作', groups: { profiles: '环境', actions: '操作', pages: '页面' },
    none: '没有匹配的结果。', move: '选择', run: '执行', close: '关闭', open: '打开', switchTo: '切换到窗口', stop: (n: string) => `停止 ${n}`,
    newProfile: '新建环境', importProfiles: '导入环境', checkProxies: '检测全部代理', addProxy: '添加代理',
    switchWs: (n: string) => `切换到 ${n}`, language: '切换到 English'
  },
  risks: {
    title: (n: number) => `发现 ${n} 项关联风险`, show: '展开', hide: '收起',
    only: '只看这些环境', clear: '显示全部环境', flag: '可能与其他环境关联',
    kinds: {
      'same-proxy': { t: (n: number, x: string) => `${n} 个环境共用代理 ${x}`, fix: '为每个环境分配独立代理。' },
      'same-ip': { t: (n: number, x: string) => `${n} 个环境经不同代理从同一 IP ${x} 出网`, fix: '这些代理的出口相同，请向服务商申请不同出口。' },
      direct: { t: (n: number) => `${n} 个环境未设置代理，直接使用本机网络`, fix: '未设置代理时，网站看到的都是本机 IP。' },
      'moved-country': { t: (_n: number, x: string) => `出口国家与上次不同（${x}）`, fix: '出口国家突变可能触发网站安全验证，请保持环境出口位置稳定。' },
      'moved-ip': { t: (_n: number, x: string) => `出口 IP 与上次不同（${x}）`, fix: '国家未变，多数网站可以接受，少数会要求验证。' },
      'same-fp': { t: (n: number) => `${n} 个环境的指纹完全相同`, fix: '在「编辑」中为其余环境重新生成指纹。' },
      'same-canvas': { t: (n: number) => `${n} 个环境的 Canvas 绘制结果相同`, fix: '体检发现 Canvas 绘制结果一致，请重新生成指纹。' }
    }
  },
  checkup: {
    run: '体检', running: '体检中…', title: (n: string) => `体检报告 · ${n}`, card: 'FOLIO · 体检报告', passed: '体检通过', review: '需处理',
    last: (when: string, ok: boolean) => `最近体检：${when} · ${ok ? '通过' : '需处理'}`, view: '查看报告', again: '重新体检',
    lead: '在环境的浏览器中打开自检页，读取网站可获取的信息。', failed: '无法在该环境中完成体检。',
    seen: '实际：', want: '应为：', none: '无',
    checks: {
      webrtc: { t: 'WebRTC 未暴露其他地址', fix: 'WebRTC 暴露了真实或局域网地址，请确认环境已设置代理并通过代理打开。' },
      timezone: { t: '时区与出口一致', fix: '在「编辑」中将时区设为跟随代理。' },
      language: { t: '语言与出口一致', fix: '在「编辑」中将语言设为跟随代理。' },
      ua: { t: 'User-Agent 与系统一致', fix: '浏览器报告的系统与环境设置不符，请重新生成指纹。' },
      canvas: { t: 'Canvas 指纹在团队内唯一', fix: '另一个环境的 Canvas 绘制结果相同，请为其中之一重新生成指纹。' },
      webgl: { t: 'WebGL', fix: '' }
    }
  },
  retry: '重试',
  errors: {
    invalid_credentials: '邮箱或密码错误。',
    unauthenticated: '登录已过期，请重新登录。',
    rate_limited: '操作过于频繁，请一分钟后重试。',
    validation: '请填写邮箱和密码。',
    network: '无法连接 Folio，请检查网络后重试。',
    internal: '服务暂时异常，请稍后重试。',
    plan_limit: '套餐额度已满。请将部分环境移至回收站，或为套餐增加环境。',
    group_exists: '已存在同名分组。',
    bad_reference: '该分组、代理或成员已不在团队中，请重新选择。',
    forbidden: '当前角色无此权限，请联系所有者或管理员。',
    seat_limit: '套餐席位已满，升级后方可邀请更多成员。',
    already_member: '该成员已在团队中。',
    group_cycle: '分组不能移到自己下面。',
    plan_required: '给分组授权成员属于公司版功能。',
    owner: '所有者始终在团队中，角色不能更改。',
    wrong_account: '该邀请发送至其他邮箱。',
    email_unverified: '请先在 Folio 官网验证邮箱。',
    invitation_expired: '该邀请已过期，请联系邀请人重新发送。',
    local_only: '该环境的登录状态仅保存在使用它的电脑上，请在该电脑上打开后再导出或导入 Cookie。',
    cookies_unreadable: '文件中未找到 Cookie。请使用 JSON（Cookie-Editor、EditThisCookie）或 cookies.txt 格式。',
    locked: '该环境正在另一台电脑上使用。',
    not_found: '该环境尚未保存登录状态。',
    wrong_passphrase: '口令错误，无法打开该文件。',
    not_folio: '该文件不是 Folio 导出文件。',
    passphrase_short: '口令至少 10 位。',
    flow_too_deep: '步骤最多嵌套四层。',
    flow_too_long: '一个流程最多 300 个步骤。',
    flow_in_use: '该流程正被任务使用，请先删除相关任务或为其更换流程。',
    task_running: '该任务正在运行。',
    no_profiles: '该任务的环境均无法运行（已删除、位于回收站或无访问权限）。',
    run_finished: '本次运行已结束。',
    extension_exists: '扩展库中已存在该附加组件，请为其上传新版本。',
    extension_mismatch: '该文件属于另一个附加组件。',
    extension_unreadable: '无法读取该扩展包（须为 crx、zip 或 xpi，且顶层包含 manifest.json）。',
    extension_kernel: '该扩展适用于另一种内核。',
    store_ref: '无法识别该商店链接或 ID。',
    store_failed: '无法从商店获取该扩展。请检查链接，或下载后上传文件。',
    no_device: '请先退出并重新登录工作台，再在本机设置定时任务。',
    already_run: '该时间点已运行。',
    kernel_exists: '该系统的此版本已在目录中。',
    upload_incomplete: '上传未完成，请重新上传。',
    upload_failed: '上传失败，请检查网络后重试。',
    kernel_archive: '请选择 .zip、.tar.xz 或 .dmg 安装包。',
    checkup_failed: '无法在该环境中完成体检。'
  }
};

export const dicts: Record<Lang, Dict> = { en, zh };
// Each language by its own name, for the switches between them.
export const LANG_NAMES: Record<Lang, string> = { en: 'English', zh: '简体中文' };

const locale = (lang: Lang) => (lang === 'zh' ? 'zh-CN' : 'en-US');
export const day = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), { year: 'numeric', month: lang === 'zh' ? 'long' : 'short', day: 'numeric' }).format(new Date(iso));

export function ago(iso: string | null, d: Dict, now = Date.now()){
  if (!iso) return d.common.never;
  const s = (now - Date.parse(iso)) / 1000;
  if (s < 60) return d.common.justNow;
  if (s < 3600) return d.common.minAgo(Math.floor(s / 60));
  if (s < 86400) return d.common.hAgo(Math.floor(s / 3600));
  if (s < 172800) return d.common.yesterday;
  return d.common.daysAgo(Math.floor(s / 86400));
}

const two = (n: number) => String(n).padStart(2, '0');
export function runTime(ms: number){
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}
export const errorText = (d: Dict, code: string) => d.errors[code] ?? d.errors.internal;
// A role's wording: the four every workspace starts with are translated, a workspace's own keeps its name.
export const roleName = (d: Dict, r: { key: string | null; name: string }) => (r.key ? d.roles[r.key as keyof Dict['roles']] : r.name);
