import type { Problem } from './csv';
import type { CheckId } from './checks';
import type { ActivityAction } from './api';
import type { Step } from '@shared/bridge';
import { SEARCH_ENGINES, type SearchEngine } from '@shared/search';

export type Lang = 'en' | 'zh';
// A toast's words: what happened, and under it what to (a name, a count, a file).
export interface News { title: string; detail?: string }
type CheckText = { t: (x: CheckVars) => string; d: (x: CheckVars) => string };
// Activity entries: who did it comes first; `p` is the profile ("Shop-07 #0007"), `x` the entry's details.
type Said = (p: string, x: Record<string, any>) => string;
export interface CheckVars { ms: number; host: string; city: string; tz: string; set: string; setLang: string; lang: string; country: string; version: string; latest: string; size: string; kernel: string; real: string }

const profilesN = (n: number) => (n === 1 ? '1 profile' : `${n} profiles`);
const proxiesN = (n: number) => (n === 1 ? '1 proxy' : `${n} proxies`);
// Field names as a log entry lists them: each once (the window's mode, width and height are one "window size"),
// the last one joined with "and".
const uniq = (items: string[]) => [...new Set(items)];
const andList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

const enFields: Record<string, string> = { searchEngine: 'search engine', restoreTabs: 'tab restoring', startUrl: 'start page', windowMode: 'window size', windowWidth: 'window size', windowHeight: 'window size', name: 'name', groupId: 'group', tags: 'tags', proxyId: 'proxy', ownerId: 'assignee', departmentId: 'department', kernelVersion: 'engine version', fingerprint: 'fingerprint', os: 'system', timezoneOverride: 'time zone', localeOverride: 'language', notes: 'notes', syncMode: 'where sign-ins are kept', extensionIds: 'extensions', type: 'type', host: 'host', port: 'port', username: 'username', password: 'password', backupId: 'backup line' };
const zhFields: Record<string, string> = { searchEngine: '搜索引擎', restoreTabs: '恢复标签页', startUrl: '启动页', windowMode: '启动窗口尺寸', windowWidth: '启动窗口尺寸', windowHeight: '启动窗口尺寸', name: '名称', groupId: '分组', tags: '标签', proxyId: '代理', ownerId: '负责人', departmentId: '部门', kernelVersion: '内核版本', fingerprint: '指纹', os: '系统', timezoneOverride: '时区', localeOverride: '语言', notes: '备注', syncMode: '登录状态保存位置', extensionIds: '扩展', type: '类型', host: '主机', port: '端口', username: '用户名', password: '密码', backupId: '备用线路' };
// A country by its two-letter code, in the language of the page ("美国", "United States").
const regions = new Map<Lang, Intl.DisplayNames>();
export const regionName = (lang: Lang, code: string) => {
  if (!regions.has(lang)) regions.set(lang, new Intl.DisplayNames([lang === 'zh' ? 'zh-CN' : 'en'], { type: 'region' }));
  return regions.get(lang)!.of(code) ?? code;
};
// A profile field as the log names it.
export const fieldName = (lang: Lang, f: string) => (lang === 'zh' ? zhFields : enFields)[f] ?? f;
const enSearch = (id: SearchEngine): string => (id === 'none' ? 'None' : SEARCH_ENGINES[id].name);
const zhSearch = (id: SearchEngine): string => (id === 'none' ? '无' : id === 'baidu' ? '百度' : SEARCH_ENGINES[id].name);

export const en = {
  login: {
    title: 'Log in to Folio', lead: 'Use the account you created on the Folio website.',
    email: 'Email', password: 'Password', submit: 'Log in',
    noAccount: 'No account yet?', create: 'Sign up on the website', forgot: 'Forgot password?',
    demo: [['US-Store-01', 'Seattle'], ['UK-Shop-01', 'London'], ['JP-Social-01', 'Tokyo']] as [string, string][]
  },
  nav: { profiles: 'Profiles', proxies: 'Proxies', extensions: 'Extensions', flows: 'Flows', sync: 'Window sync', tasks: 'Scheduled tasks', api: 'API & scripts', team: 'Team', activity: 'Activity log', jobs: 'Task center', trash: 'Trash', engines: 'Engines', groups: 'Groups', settings: 'Settings', billing: 'Plan and usage', help: 'Help', more: 'More' },
  top: {
    search: 'Search profiles, proxies or members…', bell: 'Notifications', bellNew: 'Notifications (new)', none: 'No notifications',
    planEnds: (plan: string, date: string) => `${plan} ends on ${date}. Renew it to keep its limits.`, trialEnds: (date: string) => `The free trial ends on ${date}.`,
    renew: 'Renew', choosePlan: 'Choose a plan', invited: (who: string, ws: string) => `${who} invited you to the ${ws} workspace.`,
    jobFailed: (kind: string, n: number, total: number) => `${kind}: ${n} of ${total} failed.`,
    trashKept: (n: number, manager: boolean) => `Deleted profiles stay in the Trash for ${n} days, then are deleted for good.${manager ? ' You can change this in Settings.' : ' To restore one, ask the owner or an admin.'}`,
    openTrash: 'Open the Trash'
  },
  groups: {
    title: 'Groups', all: 'All groups', none: 'No group', add: 'New group', namePh: 'Group name',
    color: 'Color', colors: { red: 'Red', blue: 'Blue', green: 'Green', amber: 'Amber', purple: 'Purple', teal: 'Teal', gray: 'Gray' },
    tree: 'Group directory', everything: 'All profiles',
    sum: (n: number, m: number | null) => `${profilesN(n)}${m === null ? '' : ` · ${m === 1 ? '1 member' : `${m} members`}`}`,
    expand: (g: string) => `Show the groups under ${g}`, collapse: (g: string) => `Hide the groups under ${g}`,
    edit: 'Edit group', addProfile: 'Add profile', search: 'Search name or number', state: 'Status', owner: 'Member', owners: 'All members', sort: 'Sort by name',
    states: { all: 'All statuses', running: 'Running', stopped: 'Not running' },
    cols: { name: 'Profile', number: 'No.', region: 'Country/region', status: 'Status', owner: 'Owner' },
    empty: 'No profiles in this group yet', emptyText: 'Create a profile in this group, or move profiles here from the profile list.', move: 'Move to group…', moveOut: 'Remove from group', movedOut: (n: number): News => ({ title: 'Removed from the group', detail: profilesN(n) }),
    settings: 'Group settings', name: 'Group name', nameErr: 'Enter a group name.', parent: 'Parent group', parentNone: 'None (top level)', description: 'Description',
    members: 'Member access', people: 'Members of the group', addMember: 'Add member', findMember: 'Search members', noneToAdd: 'Everyone is in this group.',
    roleOf: (e: string) => `Role of ${e}`, removeMember: (e: string) => `Remove ${e}`,
    roleNote: 'A role applies across the workspace; the group decides which profiles its members can access.',
    companyOnly: 'Giving members access to a group is part of the Company plan.',
    access: 'Access', inherit: 'Inherit parent group access', inheritHint: 'When on, members of the parent group also have access to this group’s profiles.',
    save: 'Save settings', saved: 'Group settings saved', delete: 'Delete group',
    deleteTitle: (g: string) => `Delete “${g}”?`, moveTo: 'Move them to', moveDelete: 'Move and delete',
    deleteHas: (g: string, n: number) => `“${g}” has ${profilesN(n)}. Choose where they go before it is deleted.`,
    deleteNote: 'Only the group goes, not its profiles; who can reach them follows the group they move to.', deleteEmpty: 'There are no profiles in it; only the group goes.',
    deleteKids: (n: number) => (n === 1 ? 'The group under it moves up a level.' : `The ${n} groups under it move up a level.`),
    deleted: (g: string): News => ({ title: 'Group deleted', detail: g }),
    newTitle: 'New group', create: 'Create group', created: (g: string): News => ({ title: 'Group created', detail: g }),
    createHint: 'Profiles can be added once it exists.', rolesTitle: 'About roles'
  },
  plans: { free: 'Free', studio: 'Studio', company: 'Company' },
  periods: { monthly: 'monthly', yearly: 'yearly' },
  roles: { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' },
  ws: { switch: 'Switch workspace', current: 'Current workspace' },
  plan: {
    usage: (used: number, limit: number) => `${used} of ${limit} profiles`,
    renews: (date: string, period: string) => `Renews ${date} · ${period}`,
    ends: (date: string) => `Ends ${date}`,
    trialEnds: (date: string) => `Free trial ends ${date}`,
    scheduled: (plan: string, date: string) => `Changes to ${plan} on ${date}`,
    upgrade: 'Upgrade', addProfiles: 'Add profiles', manage: 'Billing'
  },
  // The Plan & billing page: the plan this workspace is on, what it has used, and what it has paid.
  billing: {
    title: 'Plan and usage',
    tabs: { plan: 'Plan', usage: 'Usage', payments: 'Payments' },
    current: 'Current plan', change: 'Change plan', since: 'Started', until: 'Runs until', renew: 'Renews automatically',
    yes: 'Yes', no: 'No', status: 'Status', statusActive: 'Active', statusTrial: 'Free trial',
    limits: 'Plan limits', profiles: 'Profiles', members: 'Members', proxies: 'Proxies', logDays: 'Activity log',
    details: 'Plan details', planRow: 'Plan', all: 'View all',
    logKept: (n: number) => `${n} days`, unlimited: 'Unlimited',
    expiry: 'Remind before the plan ends', expiryHint: 'Admins get an in-app notice shortly before the plan ends.',
    payments: 'Payments', invoice: 'Invoice', date: 'Date', item: 'Item', amount: 'Amount', paid: 'Paid', refunded: 'Refunded',
    open: 'Open', none: 'No payments yet', noneHint: 'Payments for this workspace show here.'
  },
  // The Settings page: what the workspace is, what new profiles start with, and how opening one behaves.
  settings: {
    title: 'Settings',
    tabs: { workspace: 'Workspace', defaults: 'Profile defaults', opening: 'Opening', notices: 'Notifications', data: 'Data', billing: 'Plan and usage' },
    basics: 'Basics', basicsLead: 'The workspace\u2019s name, its ID and who owns it.',
    name: 'Workspace name', id: 'Workspace ID', idHint: 'The ID identifies this workspace and never changes.',
    owner: 'Owner', ownerHint: 'The person who created the workspace.',
    defaults: 'Profile defaults', defaultsLead: 'What a new profile starts with.',
    defaultsNote: 'These apply only to profiles created from now on; existing ones keep their settings.',
    trashDays: 'Keep deleted profiles for', trashDaysHint: 'Profiles in the Trash longer than this are permanently deleted, with their sign-ins.',
    engine: 'Default engine', engineNone: 'Recommended version', engineAuto: 'Recommended engine', engineHint: 'The engine a new profile starts with.',
    groupHint: 'The group a new profile goes into.', proxyHint: 'The proxy a new profile connects through.',
    readOnly: 'Only the owner and admins can change these settings.', idCopied: 'Workspace ID copied',
    group: 'Default group', groupNone: 'No group', proxy: 'Default proxy', proxyNone: 'No proxy',
    opening: 'Opening', openingLead: 'What happens when a profile is opened and closed.',
    openDetail: 'Show the profile\u2019s page after it opens', openDetailHint: 'The profile\u2019s page opens as soon as its browser starts.',
    stopOnClose: 'Stop the profile when its last window closes', stopOnCloseHint: 'With this off, closing the browser leaves the profile running: Go to window opens it again, and Stop ends it and saves its sign-ins.',
    notices: 'Notifications', noticesLead: 'What Folio tells you about, on the desktop and under the bell. These follow your account wherever you sign in.',
    notifyItems: { taskDone: 'Batch task finished', taskFailed: 'Batch task with failures', proxyDown: 'Proxy can’t connect', productUpdate: 'New version' },
    on: 'On', off: 'Off', workspaceNotices: 'Workspace reminder',
    expiry: 'Remind before the plan ends',
    data: 'Export and import', dataLead: 'A whole workspace in one encrypted file: profiles, proxies, groups and sign-ins.',
    saved: 'Settings saved', save: 'Save changes'
  },
  // The person's own page (v2 32–35): their name and note, password, workspaces, logging out.
  account: {
    title: 'Profile',
    menu: { profile: 'Profile', password: 'Change password', switch: 'Switch workspace', logout: 'Log out' },
    info: 'Account', displayName: 'Display name', displayNameHint: 'How colleagues see you: in the team, the log and as an owner.', email: 'Email', note: 'Note', notePh: 'For example: storefront operations',
    emailNote: 'Your email is how you log in; change it on the website’s account page.', nameErr: 'Enter a name.', saved: 'Profile saved',
    password: { current: 'Current password', next: 'New password', confirm: 'Confirm new password', rule: '8 to 64 characters.', currentErr: 'Enter your current password.', short: 'Use 8 to 64 characters.', mismatch: 'The two new passwords don’t match.', done: { title: 'Password changed', detail: 'Sign-ins on other computers have ended' } },
    switchDlg: { title: 'Switch workspace', field: 'Workspace', note: 'Switching changes what you see; nothing moves between workspaces. Save changes before you switch.', invites: 'Invitations', go: 'Switch' },
    logoutDlg: {
      title: 'Log out', ask: 'Log out of this account?',
      running: (profiles: number, runs: number) => [profiles ? `${profiles} running ${profiles === 1 ? 'profile saves its' : 'profiles save their'} sign-ins and ${profiles === 1 ? 'closes' : 'close'}` : '', runs ? `${runs} ${runs === 1 ? 'flow or task stops' : 'flows and tasks stop'}` : ''].filter(Boolean).join('; ') + '.',
      sync: 'Window sync stops.', go: 'Log out'
    },
    version: (v: string) => `Folio ${v}`, save: 'Save changes'
  },
  user: {
    account: 'Account', manage: 'Manage account', teams: 'Workspaces', settings: 'Settings', data: 'Data', language: 'Language',
    // Each language named in this one: no Chinese script on the English interface.
    langs: { en: 'English', zh: 'Chinese' },
    exportAll: 'Export all data…', importAll: 'Import data…', logout: 'Log out',
    startup: 'Open Folio at startup', startupHint: 'Opens minimized in the tray, so scheduled tasks run on time.'
  },
  tray: { open: 'Open Folio', quit: 'Quit Folio', background: 'Folio keeps running in the background so scheduled tasks run on time. Quit it from the tray icon.' },
  notify: {
    signedOut: (task: string, names: string[]) => ({ title: names.length === 1 ? `${names[0]} is signed out` : `${names.length} profiles are signed out`, body: `${task}: ${names.join(', ')}` }),
    taskDone: (kind: string, n: number) => ({ title: `${kind} finished`, body: `${n} ${n === 1 ? 'item' : 'items'} done.` }),
    taskFailed: (kind: string, failed: number, total: number) => ({ title: `${kind}: ${failed} failed`, body: `${failed} of ${total} failed. The task center says why.` }),
    proxyDown: (name: string, why: string) => ({ title: `${name} can’t connect`, body: why }),
    productUpdate: (v: string) => ({ title: `Folio ${v} is out`, body: 'Update it from the sidebar.' })
  },
  update: {
    ready: (v: string) => `Folio ${v} is ready to install.`, restart: 'Restart to update', restartNote: 'Open profiles are saved and closed first. Otherwise, it installs the next time you quit Folio.',
    out: (v: string) => `Folio ${v} is out.`, download: 'Download'
  },
  common: {
    cancel: 'Cancel', save: 'Save', close: 'Close', undo: 'Undo', check: 'Check', checking: 'Checking…', edit: 'Edit', copy: 'Copy', copied: 'Copied',
    picked: { profiles: (n: number) => `${profilesN(n)} selected`, proxies: (n: number) => `${proxiesN(n)} selected`, extensions: (n: number) => `${n} ${n === 1 ? 'extension' : 'extensions'} selected`,
      cookies: (n: number) => `${n} ${n === 1 ? 'cookie' : 'cookies'} selected` }, clearSelection: 'Clear selection', selectAll: 'Select this page', select: (x: string) => `Select ${x}`,
    never: 'Never', justNow: 'Just now', runDays: (days: number, h: number) => `${days} d ${h} h`, minAgo: (n: number) => `${n} min ago`, hAgo: (n: number) => `${n} h ago`, yesterday: 'Yesterday', daysAgo: (n: number) => `${n} days ago`,
    loadFailed: 'This list couldn’t be loaded', loadRetry: 'Load again', resize: 'Resize the panel',
    discardTitle: 'Discard unsaved changes?', discardNote: 'What you changed here won’t be saved.', keepEditing: 'Keep editing', discard: 'Discard changes',
    listLoading: 'Loading…', listFailed: 'Couldn’t load the list.', retry: 'Retry', noOptions: 'Nothing to choose from yet', noMatch: 'No matches',
    attribution: 'IP Geolocation by DB-IP'
  },
  os: { windows: 'Windows', macos: 'macOS', linux: 'Linux' },
  profiles: {
    title: 'Profiles', count: profilesN,
    search: 'Search profiles', searchPh: 'Search name, number, city or tag', new: 'New profile', import: 'Import',
    sum: {
      running: 'Running', proxy: 'Proxy problems', proxyOk: 'All proxies connected',
      proxyNote: (down: number, slow: number) => [down && `${down} not responding`, slow && `${slow} slow`].filter(Boolean).join(' · '),
      risks: 'Linking risks', risksOk: 'No linking risks found'
    },
    views: { label: 'View', list: 'List', cards: 'Cards' },
    tabs: { all: 'All', running: 'Running', stopped: 'Not running', trash: 'Trash' },
    filter: { label: 'Status', all: 'All', states: 'All statuses', running: 'Running', stopped: 'Not running', issues: 'Needs attention', starred: 'Favorites', engine: 'Engine', engines: 'All engines' },
    reset: 'Reset', resetN: (n: number) => `Reset (${n})`,
    filterLabels: { keyword: 'Keyword', group: 'Group', engine: 'Engine', status: 'Status' },
    page: { total: (n: number) => `${n} ${n === 1 ? 'record' : 'records'}`, size: (n: number) => `${n} per page`, prev: 'Previous page', next: 'Next page', go: (p: number) => `Page ${p}` },
    star: 'Add to favorites', unstar: 'Remove from favorites', move: 'Move to group', moveTitle: (n: string) => `Move “${n}” to a group`,
    sort: 'Sort', sorts: { recent: 'Recently opened', name: 'Name A–Z', latency: 'Proxy latency' },
    cols: { profile: 'Name / No.', group: 'Group', tags: 'Tags', engine: 'Engine / system', proxy: 'Proxy / region', extensions: 'Extensions', last: 'Last used', status: 'Status', actions: 'Actions' },
    extensionsN: (n: number) => (n === 1 ? '1 extension' : `${n} extensions`),
    open: 'Open', stop: 'Stop', enter: 'Go to window', actionsX: (n: string) => `Actions for ${n}`, starting: 'Starting…', inUse: 'In use now',
    st: { idle: 'Not running', running: 'Running', noWindow: 'Running · window closed', proxyDown: 'Proxy down' }, checkProxy: 'Check proxy',
    stage: { proxy: 'Checking the proxy…', restore: 'Restoring sign-ins…', launch: 'Starting the browser…' }, stages: ['Engine', 'Proxy', 'Sign-ins', 'Browser'],
    map: {
      label: 'Where the profiles’ proxies exit',
      check: 'Check all proxies', add: 'Add proxy'
    },
    palette: 'Search everything',
    restoring: 'Restoring sign-ins…', saving: 'Saving sign-ins…', inUseOn: (where: string) => `In use on ${where}`,
    downloading: (pct: number) => `Downloading engine… ${pct}%`,
    noProxy: 'No proxy', unchecked: 'Not checked', noResponse: 'No response', ms: (n: number) => `${n} ms`, mismatch: '! Doesn’t match its proxy',
    unassigned: 'Unassigned',
    emptyMatch: 'No profiles match', emptyFor: (q: string) => `Nothing found for “${q}”.`,
    emptyHint: (n: number) => (n === 1 ? 'Try another search, or clear the filters to see it.' : `Try another search, or clear the filters to see all ${n}.`),
    bulk: {
      title: 'Bulk actions', open: 'Open', stop: 'Stop', openSkip: (n: number) => `${n} already running or in use elsewhere will be skipped`, hidden: (n: number) => `${n} hidden by filters`, stopSkip: (n: number) => `${n} not running on this computer will be skipped`, move: 'Move to group', edit: 'Bulk edit…', more: 'More',
      trash: 'Move to Trash', cookies: 'Export cookies…', sync: 'Sync windows',
      confirm: (n: number) => `Move ${profilesN(n)} to the Trash?`, confirmNote: 'Running ones are stopped first. You can undo this.', doTrash: 'Move to Trash'
    },
    done: {
      trashed: (n: number): News => ({ title: 'Moved to the Trash', detail: profilesN(n) }), moved: (n: number, g: string): News => ({ title: `Moved to ${g}`, detail: profilesN(n) }),
      starred: (n: number): News => ({ title: 'Added to favorites', detail: profilesN(n) }), unstarred: (n: number): News => ({ title: 'Removed from favorites', detail: profilesN(n) }),
      created: 'Profile created', saved: 'Changes saved',
      stale: 'Someone changed this profile in the meantime. Try again.',
      extAdded: (n: number, x: string, skipped: number): News => ({ title: 'Extension installed', detail: `${x} · ${profilesN(n)}${skipped ? `; ${skipped} skipped (other engine, or already there)` : ''}` }),
      syncing: (leader: string, n: number): News => ({ title: 'Window sync started', detail: `${leader} leads · ${n === 1 ? '1 window follows' : `${n} windows follow`}` }), syncFailed: 'Window sync needs at least two open profiles.'
    }
  },
  // Several profiles changed at once: what changes, which ones it reaches, and which are skipped.
  bulkEdit: {
    title: 'Bulk edit profiles', lead: (n: number) => `${profilesN(n)} selected`,
    group: 'Group', groupHint: 'The selected profiles move to this group.',
    proxy: 'Proxy', proxyHint: 'The selected profiles connect through this proxy.',
    engine: 'Engine version', engineHint: 'The selected profiles of this engine use this version.',
    start: 'Start page', startHint: 'The page the selected profiles open on.', startPh: 'https://',
    tags: 'Tags', tagsHint: 'Separate tags with commas.', add: 'Add', remove: 'Remove', addTags: 'Add tags', removeTags: 'Remove tags',
    owner: 'Assigned to', ownerHint: 'The selected profiles are assigned to this member.',
    ext: 'Extension', extHint: 'Applies to the selected profiles of the extension’s engine.', pickExt: 'Choose an extension', install: 'Install', uninstall: 'Uninstall',
    searchHint: 'The search engine of the address bar and new tabs.', tabsHint: 'Whether the selected profiles reopen their last tabs.',
    keep: 'No change', changes: 'What changes', none: 'Nothing chosen yet.',
    picked: (n: number) => `Selected (${n})`, running: (n: number) => (n === 1 ? '1 of them is running and stays as it is.' : `${n} of them are running and stay as they are.`),
    stoppedOnly: 'Only change profiles that are not running', stoppedOnlyHint: 'A running profile keeps its settings until it is closed.',
    counts: (ok: number, skip: number) => `${ok} to change · ${skip} skipped`,
    submit: (n: number) => `Change ${profilesN(n)}`, done: (n: number): News => ({ title: 'Profiles changed', detail: profilesN(n) })
  },
  launch: {
    kernel_missing: 'This engine isn’t downloaded on this computer.', proxy_down: 'The proxy didn’t respond, and there’s no working backup line.',
    in_trash: 'This profile is in the Trash.', not_found: 'This profile no longer exists.', launch_failed: 'The browser didn’t start. Try again.',
    download_failed: 'The engine download failed. Check the connection and try again.',
    locked: 'This profile is open on another computer.',
    lock_lost: 'Someone took this profile over on another computer, so it was closed here.',
    save_failed: 'The browser closed, but its sign-ins couldn’t be saved to Folio. They are still on this computer.'
  } as Record<string, string>,
  detail: {
    profile: 'Profile', crumbs: 'Breadcrumb', basics: 'Basics', proxyCard: 'Proxy connection', dataCard: 'Profile data', manage: 'Manage',
    viewAll: 'View all', lastOpened: 'Last opened', synced: 'Last saved', answered: (ms: number) => `Responding · ${ms} ms`,
    openProfile: 'Open profile', edit: 'Edit', editProfile: 'Edit profile', trash: 'Move to Trash', viewProxy: 'View proxy',
    notChecked: 'Exit not checked yet', noExit: 'Proxy not responding', direct: 'Direct connection',
    tabs: { overview: 'Overview', fingerprint: 'Fingerprint', cookies: 'Cookies', activity: 'Activity' }, more: 'More actions', fingerprint: 'Fingerprint summary',
    verdict: { ok: 'All consistent', warn: 'Needs attention', bad: 'Can’t open' },
    fields: {
      name: 'Name', number: 'Number', lang: 'Language', tz: 'Time zone', os: 'OS', engine: 'Engine', window: 'Window size',
      proxyName: 'Proxy', proxyType: 'Protocol and address', ip: 'Exit IP', state: 'Status', checked: 'Last checked'
    },
    hostTz: 'This computer’s',
    checksTitle: 'Consistency check', notes: 'Notes', status: { ok: 'Passed', todo: 'To do', warn: 'Warning', bad: 'Problem' },
    cookies: 'Cookies', siteData: 'Site storage', sites: 'Sites', extensions: 'Extensions', noExtensions: 'None installed',
    notSaved: 'Nothing saved yet. Sign-ins are saved when the browser closes.', localOnly: 'Kept on the computer that uses it; Folio holds no copy.',
    json: 'JSON', netscape: 'cookies.txt',
    exported: (n: number, path: string): News => ({ title: 'Cookies exported', detail: `${profilesN(n)} · ${path}` }), imported: (n: number): News => ({ title: 'Cookies imported', detail: `${n} ${n === 1 ? 'cookie' : 'cookies'}` }),
    inUse: 'In use elsewhere', away: (device: string, email: string, since: string) => `Open on ${device} (${email}) since ${since}.`,
    takeover: 'Take over', takeoverNote: 'Their browser closes. Changes made there in the last few minutes are lost.', takeoverDo: 'Take over and open'
  },
  // The Cookies tab of a profile's page, and bringing cookies in.
  cookies: {
    title: 'Cookies saved for this profile', search: 'Search domain or name', domain: 'Domain', allDomains: 'All domains',
    count: (n: number) => `${n} ${n === 1 ? 'cookie' : 'cookies'}`, synced: (when: string) => `last saved ${when}`, reload: 'Reload',
    export: 'Export', import: 'Import cookies',
    cols: { name: 'Name', domain: 'Domain', path: 'Path', expires: 'Expires', flags: 'Flags', actions: 'Actions' },
    session: 'Session', edit: 'Edit', delete: 'Delete',
    deleteN: (n: number) => (n === 1 ? 'Delete this cookie?' : `Delete ${n} cookies?`),
    deleteNote: 'Deleted cookies are removed from the saved sign-ins. This can’t be undone.',
    deleteRunning: 'Deleted cookies are removed from the saved sign-ins and from the browser open on this computer. This can’t be undone.',
    deleted: (n: number): News => ({ title: 'Cookies deleted', detail: `${n} ${n === 1 ? 'cookie' : 'cookies'}` }),
    detail: 'Cookie details', close: 'Close details', value: 'Value', show: 'Show', hide: 'Hide', copy: 'Copy the value', copied: 'Value copied',
    hidden: 'Values stay hidden until asked for; each read is recorded in the activity log.', noValue: 'Your role can’t read cookie values.', on: 'On', off: 'Off',
    none: 'No cookies saved', noneText: 'Cookies are saved here when the browser closes after signing in to sites, or they can be imported.', notSaved: 'Nothing saved yet', notSavedText: 'Cookies are saved when the browser closes, or come in from a file.',
    local: 'Sign-ins stay on the computer that uses this profile; Folio holds no copy to list here.',
    localRunning: 'Sign-ins stay on this computer; cookies imported now go straight into the open browser.',
    away: 'This profile is open on another computer; its cookies can be edited once it is closed there.',
    editTitle: 'Edit cookie', save: 'Save cookie', keepValue: 'Hidden; leave it to keep the current value',
    editNote: 'The value stays hidden unless shown (showing it is recorded). The activity log records the change, never the value.',
    sessionOnly: 'Session cookie', domainErr: 'A cookie needs a domain.', pathErr: 'A cookie needs a path, such as /.', nameErr: 'A cookie needs a name.', expiresErr: 'Choose when it expires, or make it a session cookie.',
    exportTitle: 'Export cookies', exportNote: (target: string) => `${target}: the file holds the sites’ sign-ins. Keep it safe; the export is recorded in the activity log.`,
    exportMany: (n: number) => `${n} profiles`, exportScope: 'What to export', scopePicked: (n: number) => `The ${n} selected`, scopeDomain: (site: string) => `All on ${site}`, scopeAll: 'All cookies',
    scopeAllOf: (n: number) => `All cookies of the ${n} selected profiles`, format: 'File format', exportSure: 'I have checked what is exported and what it is for', exportDo: 'Export file',
    importTitle: (name: string) => `Import cookies into ${name}`, modes: { text: 'Paste text', file: 'From a file' }, chooseFile: 'Choose a file…', noFile: 'No file chosen',
    formats: 'JSON (Cookie-Editor, EditThisCookie, Playwright) or Netscape cookies.txt; every entry is checked before anything comes in.',
    detected: (f: string) => `Read as ${f}.`, notJson: 'This isn’t JSON that can be read. Check the brackets and quotes.',
    preview: 'Preview', valid: (n: number) => `${n} valid`, invalid: (n: number) => `${n} invalid`, result: 'Result', ok: 'Valid',
    why: { name: 'No name', value: 'No value', domain: 'No domain', line: 'Not a cookie line' },
    willReplace: 'replaces the saved one', willSkip: 'already saved: kept',
    conflict: 'When a cookie is already saved', replace: 'Replace', skip: 'Keep saved', conflictHelp: 'A cookie is the same when its name, domain and path are.',
    submit: (n: number) => `Import ${n} ${n === 1 ? 'cookie' : 'cookies'}`
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
    opened: 'Opened', waiting: 'Waiting', retry: 'Retry', fold: 'Collapse', unfold: 'Expand', close: 'Close'
  },
  checks: {
    'proxy-ok': { t: x => `Proxy responding · ${x.ms} ms`, d: x => x.host },
    'proxy-slow': { t: x => `Proxy is slow · ${x.ms} ms`, d: x => `${x.host}. Pages may time out.` },
    'proxy-down': { t: () => 'Proxy didn’t respond', d: x => `${x.host}. The profile can’t open until it responds.` },
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
    rtc: { t: () => 'WebRTC shows the proxy IP only', d: () => 'The real IP of this computer stays hidden.' },
    'rtc-off': { t: () => 'WebRTC is off', d: () => 'Sites that need calls or video don’t work in this profile.' },
    'fp-real': { t: x => `Real values from this computer: ${x.real}`, d: () => 'Profiles on the same computer can be linked by them.' },
    'engine-ok': { t: x => `${x.kernel} ${x.version}`, d: () => 'The recommended version' },
    'engine-older': { t: x => `${x.kernel} ${x.version}`, d: x => `${x.latest} is recommended. The fingerprint stays the same when you upgrade.` },
    'engine-missing': { t: x => `${x.kernel} ${x.version} isn’t downloaded yet`, d: x => `${x.size}, once for all profiles. It downloads when you open the profile.` },
    'engine-unavailable': { t: x => `${x.kernel} ${x.version} isn’t built for this computer’s system`, d: x => `Use ${x.latest} for this profile to open it here.` }
  } satisfies Record<CheckId, CheckText>,
  fixes: { check: 'Check again', backup: 'Make the backup the main line', 'choose-proxy': 'Choose a proxy', 'follow-tz': 'Follow the proxy', 'follow-lang': 'Follow the proxy', download: 'Download', use: (v: string) => `Use ${v}`, edit: 'Change settings' },
  // A profile's fingerprint choices, in the profile form and its details.
  fp: {
    title: 'Fingerprint', random: 'New random fingerprint',
    screen: 'Screen resolution', screenRandom: 'Random for the system', screenHost: 'This computer’s screen',
    screenHostHint: 'Chromium uses this computer’s screen.', cores: 'CPU cores',
    webrtc: 'WebRTC', webrtcOpts: { udp: 'Block non-proxied UDP', replace: 'Show the proxy IP', block: 'Off' },
    webgl: 'WebGL', webglOpts: { spoof: 'Random GPU', real: 'This computer’s GPU' },
    canvas: 'Canvas', canvasOpts: { noise: 'Noise', real: 'This computer’s', engine: 'Set by the engine' }
  },
  form: {
    newTitle: 'New profile', editTitle: 'Edit profile', name: 'Name', defaultName: (n: number) => `Profile ${n}`, nameErr: 'Enter a name.',
    sections: { basic: 'Basics', proxy: 'Proxy', fp: 'Fingerprint', ext: 'Extensions', launch: 'Opening' }, sectionsLabel: 'Sections', hasProblem: 'Something here needs fixing',
    optional: ' (optional)',
    group: 'Group', noGroup: 'No group', newGroup: 'New group…', newGroupPh: 'Name of the new group',
    engine: 'Browser engine', os: 'Operating system', notDownloaded: (size: string) => `Not downloaded · ${size}`,
    proxyKind: 'Proxy type', proxyMode: { saved: 'Saved proxy', custom: 'New proxy', none: 'No proxy' }, pickProxy: 'Choose a proxy', pickProxyFirst: 'Choose or paste a proxy first.',
    pickErr: 'Choose a proxy, or pick No proxy.', pastePh: 'socks5://user:pass@host:port',
    proxyBad: 'That doesn’t look like a proxy address.',
    proxyOk: (place: string, ms: number) => `Connected · ${place} · ${ms} ms`, proxyDown: 'Can’t connect',
    checkedAt: (t: string) => `checked at ${t}`, lastChecked: (t: string) => `last checked at ${t}`,
    tags: 'Tags', tagsPh: 'Comma-separated',
    regenWarn: 'Sites will see a new device; signed-in sites may ask you to verify again.', fpErr: 'Couldn’t generate a fingerprint.',
    firefoxMissing: 'Download the Firefox engine to make this fingerprint.', download: 'Download', downloading: (pct: number) => `Downloading… ${pct}%`,
    fpEdit: 'Edit fingerprint', fpHide: 'Hide fingerprint settings', exitUnknown: 'Exit not checked yet',
    create: 'Create profile', save: 'Save changes', tz: 'Time zone', lang: 'Language', follow: 'Follow the proxy',
    tzPh: 'Search time zones, e.g., Berlin', langPh: 'de-DE', langErr: 'Use a language tag like de-DE.', searchPh: 'Search…',
    startUrl: 'Start page', startUrlHint: 'Left empty, it opens its last tabs or its search engine’s home page.',
    startUrlErr: 'Use an address that starts with http:// or https://.',
    window: 'Window size', windowModes: { default: 'Default', custom: 'Custom', maximized: 'Maximized' }, width: 'Width', height: 'Height',
    windowHint: 'This sets the size of the browser window; the screen resolution is set under Fingerprint.', windowErr: 'Use a width of 400–7680 and a height of 300–4320 pixels.',
    notes: 'Notes', owner: 'Assigned to',
    noExtensions: (engine: string) => `The library has no ${engine} extensions yet.`, extSearch: 'Search the library', extPicked: (n: number) => `${n} selected`,
    extNone: 'No extension matches.', extAdd: 'Add to the library', extAddNote: 'Only the owner and admins can add extensions to the library.',
    sync: 'Sign-ins', syncCloud: 'Save to Folio and follow the profile', syncLocal: 'Keep on the computer that uses it',
    syncHelp: 'Kept on one computer, sign-ins never leave it, and the profile opens signed out anywhere else.',
    stale: 'Someone changed this profile while you were editing. Save again to replace their changes, or cancel to keep them.',
    nextOpen: 'Changes apply the next time it opens', runningNote: 'Stop it to change its engine, system, proxy or fingerprint',
    runningTitle: 'The profile is running', runningBody: 'Stop it to change its engine, system, proxy or fingerprint.', stopNow: 'Stop profile',
    osTitle: 'Change the system?', osChange: 'Change',
    osBody: (os: string) => `Its fingerprint is drawn again for ${os} (screen, graphics, fonts and more), so websites may take it for a new device.`,
    kindFixed: (other: string) => `A saved profile can’t switch to ${other}: the two engines keep their data differently.`,
    unsaved: 'Unsaved changes', changedN: (n: number) => `${n} changed`, createHint: 'Everything here can be changed later.'
  },
  // The Fingerprint tab of a profile's page.
  fpTab: {
    next: 'Changes apply the next time the profile opens.', locked: 'The profile is running; stop it to change its fingerprint.',
    browser: 'Browser', screen: 'Screen', langTz: 'Language and time zone', hardware: 'Hardware and media',
    current: 'Saved configuration', consistency: 'Consistency', advanced: 'Advanced',
    ua: 'User-Agent', uaLater: 'Made by the engine from the system and version; run a health check to see it here.',
    screenHint: 'The screen resolution is what sites read; the window size is set when editing the profile.',
    defaults: 'Restore defaults', save: 'Save fingerprint', saved: 'Fingerprint saved'
  },
  // A profile's search engine and the pages it opens with.
  browser: {
    search: 'Search engine', name: enSearch,
    restore: 'Restore last tabs',
    start: 'On opening', startTabs: 'Restores the last tabs', startHome: (name: string) => `Opens the ${name} home page`, startBlank: 'Opens a blank page',
    on: 'On', off: 'Off'
  },
  importer: {
    title: 'Import profiles', lead: 'One profile per row with a header row. Save Excel sheets as CSV first; up to 500 rows at a time.',
    columns: 'Columns: name (required), group, tags (separated by |), os (windows, macos, linux), engine (chromium, firefox), proxy, timezone, language, search engine (google, bing, baidu, duckduckgo, yahoo, yandex or none), restore tabs (yes or no), notes, cookies (JSON or cookies.txt text).',
    example: 'Insert an example', file: 'Choose a file…', pasteLabel: 'CSV', ready: (n: number) => `${profilesN(n)} ready to import.`,
    problems: 'Fix these rows first:', row: (n: number) => `Row ${n}`, header: 'The first row needs a “name” column.',
    errs: { name: 'the name is missing or too long', os: 'unknown system', engine: 'unknown engine', tags: 'up to 10 tags, 24 characters each', timezone: 'unknown time zone', language: 'not a language tag', proxy: 'the proxy can’t be read', cookies: 'no cookies could be read', search: 'unknown search engine', restoreTabs: 'use yes or no', header: '' } satisfies Record<Problem | 'proxy', string>,
    tooMany: 'Up to 500 rows at a time.', room: (free: number) => `The plan has room for ${profilesN(free)} more.`, firefox: 'Some rows use Firefox: download its engine first.',
    submit: (n: number) => `Import ${profilesN(n)}`, steps: { proxies: 'Adding proxies…', groups: 'Creating groups…', fingerprints: (i: number, n: number) => `Making fingerprints… ${i} / ${n}`, saving: 'Saving…', cookies: (i: number, n: number) => `Importing cookies… ${i} / ${n}` },
    done: (n: number): News => ({ title: 'Profiles imported', detail: profilesN(n) })
  },
  proxies: {
    title: 'Proxies',
    search: 'Search proxies', searchPh: 'Search name, host or city', add: 'Add proxy', import: 'Import', checkAll: 'Check all',
    allTab: 'All proxies', importTab: 'Import',
    filterLabels: { keyword: 'Keyword', type: 'Protocol', region: 'Region', status: 'Status' },
    filter: { type: 'Protocol', types: 'All protocols', region: 'Region', regions: 'All regions', state: 'Status', states: 'All statuses' },
    cols: { name: 'Name', type: 'Protocol', address: 'Address', exit: 'Region', status: 'Connection', latency: 'Latency', profiles: 'Profiles', actions: 'Actions' },
    labels: { latency: 'Latency', uptime: 'Uptime', profiles: 'Profiles' }, backupOf: (n: string) => `backup ${n}`, noExit: 'Exit unknown',
    downNote: (n: number, when: string | null) => `${n === 1 ? 'Couldn’t connect the last time' : `Couldn’t connect the last ${n} times`}${when ? ` · last connected ${when}` : ''}`,
    states: { ok: 'Connected', slow: 'Slow', down: 'Can’t connect', unchecked: 'Not checked', issues: 'Slow or can’t connect', unbound: 'Unused' },
    history: (n: number) => `Last ${n} ${n === 1 ? 'check' : 'checks'}`, never: 'Not checked',
    emptyTitle: 'No proxies yet', empty: 'Add one, or import a list from your provider.', addFirst: 'Add the first proxy', importList: 'Import a list',
    bulkCheck: 'Check', bulkDelete: 'Delete', confirmDelete: (n: number) => `Delete ${proxiesN(n)}?`, confirmNote: 'Profiles that use a deleted proxy keep working without one.',
    bulk: {
      unbind: 'Unassign', unbindNone: 'None of the selected proxies is assigned to a profile.', unbindTitle: (n: number, m: number) => `Unassign ${proxiesN(n)} from ${profilesN(m)}?`,
      unbindNote: 'Those profiles connect without a proxy until another is assigned; running ones change the next time they open.',
      unbound: (m: number): News => ({ title: 'Proxy unassigned', detail: profilesN(m) })
    },
    deleted: (n: number): News => ({ title: n === 1 ? 'Proxy deleted' : 'Proxies deleted', detail: proxiesN(n) }), checked: (n: number): News => ({ title: 'Check finished', detail: proxiesN(n) }), actionsX: (n: string) => `Actions for ${n}`,
    detail: {
      label: 'Proxy', exitIp: 'Exit IP', region: 'Region', latency: 'Latency', profiles: 'Profiles', config: 'Connection', history: 'Recent checks',
      ok: (ms: number) => `Responded · ${ms} ms`, failed: 'No response', passSet: 'Saved', passNone: 'None', uptime: 'Uptime',
      uptimeOf: (pct: number, n: number) => `${pct}% of the last ${n === 1 ? 'check' : `${n} checks`}`, bound: (n: number) => `Profiles (${n})`,
      none: 'No profile uses it.', noHistory: 'Not checked yet.',
      created: 'Added', lastChecked: 'Last checked', failure: 'Why it failed', viewAll: 'View all', manage: 'Manage', details: 'View details',
      tabs: { overview: 'Overview', bound: 'Profiles', checks: 'Checks' },
      createdOn: (when: string) => `Added ${when}`, checkedOn: (when: string) => `last checked ${when}`, authOn: 'On', authOff: 'Off',
      runningWarn: 'Stop the running profiles that use this proxy before changing how it connects.', viewProfile: 'View profile'
    },
    formAdd: 'Add proxy', formEdit: 'Edit proxy', save: 'Save proxy', added: 'Proxy added',
    name: 'Name', namePh: 'e.g., US-West-01', nameErr: 'Enter a name for the proxy.', type: 'Protocol', host: 'Host', port: 'Port', notes: 'Notes',
    auth: 'Authentication', authHint: 'When on, the proxy is reached with a username and password.',
    user: 'Username', pass: 'Password', passKeep: 'Saved. Leave empty to keep it.', reveal: 'Show', conceal: 'Hide',
    lastTest: (when: string) => `Last checked: ${when}`, justNow: 'just now', typedTest: 'Checked with the details as typed; not saved yet',
    test: 'Check connection', testOk: 'Connected', testBad: 'Can’t connect',
    // Why a check failed (the step that failed), and what to look at.
    why: {
      proxy_unreachable: 'Can’t reach the proxy server', proxy_timeout: 'The proxy server didn’t answer in time', proxy_auth: 'Username or password rejected',
      proxy_protocol: 'The proxy didn’t answer in the chosen protocol', target_refused: 'The proxy couldn’t reach the check address',
      target_timeout: 'The proxy took too long to reach the check address', tls: 'The secure connection failed', no_ip: 'No exit IP came back'
    } as Record<string, string>,
    whyHttp: (status: string) => `The check address answered HTTP ${status}`,
    fix: {
      proxy_unreachable: 'Check the proxy’s address and port.', proxy_timeout: 'The proxy may be down, or this network can’t reach it.',
      proxy_auth: 'Check the username and password. If they work on another computer, add this computer’s public IP to the provider’s allowlist, and check the plan hasn’t expired.', proxy_protocol: 'Check the type (SOCKS5 or HTTP), and whether the proxy only accepts listed IP addresses.',
      target_refused: 'The proxy is up, but it turned down or couldn’t reach the public check address.', target_timeout: 'The proxy is up, but too slow.',
      tls: 'The secure connection to the check address through the proxy failed.', no_ip: 'The check address didn’t return an exit IP. Try again later.'
    } as Record<string, string>,
    recheck: 'The connection details changed. Check the connection again.',
    bound: (n: number, running: number) => `Used by ${n} ${n === 1 ? 'profile' : 'profiles'}, ${running} running now.`,
    boundHere: 'To change how it connects, the ones running on this computer stop first.',
    boundThere: (n: number) => `${n} running on other computers ${n === 1 ? 'uses' : 'use'} the new details from the next start.`,
    stopSave: 'Stop them and save',
    launchWhy: (why: string) => `The proxy check failed (${why}), and there’s no working backup line.`,
    addMore: 'Add another after saving',
    backup: 'Backup line', backupNone: 'None', backupHint: 'Used automatically when this line doesn’t respond.',
    hostErr: 'Enter a host name or IP address.', portErr: 'Ports go from 1 to 65535.',
    imp: {
      title: 'Import proxies', modes: { text: 'Paste text', file: 'From a file' },
      protocol: 'Protocol', protocolHint: 'For lines that don’t say which.', naming: 'Naming', namePh: 'Proxy-{n}', sep: ', ',
      nameHint: (ex: string) => `New proxies are numbered: ${ex}…`, list: 'Proxy list', listHint: ' One per line; username and password optional.',
      formats: 'Formats: host:port:user:pass · user:pass@host:port · socks5://user:pass@host:port · host:port',
      chooseFile: 'Choose a file…', noFile: 'No file chosen',
      notesTitle: 'Before you import', notes: ['Ports go from 1 to 65535.', 'Lines already saved show in the preview.', 'Check the connections after importing.'],
      preview: 'Preview', counts: (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`, valid: (n: number) => `${n} valid`, invalid: (n: number) => `${n} invalid`,
      cols: { line: 'Line', address: 'Address', port: 'Port', result: 'Result' },
      ok: 'Valid', saved: 'already saved: reused', repeat: 'same as a line above', again: 'added again',
      why: { format: 'Not a proxy line', port: 'Port must be 1–65535' },
      invalidNote: 'Invalid lines aren’t imported; correct them and read the list again.',
      skip: 'Skip duplicate proxies', skipHelp: 'A line identical to a saved proxy, or to a line above, uses that one instead of adding another.',
      reparse: 'Read again', submit: (n: number) => `Import ${proxiesN(n)}`,
      done: (added: number, reused: number): News => ({ title: 'Proxies imported', detail: `${proxiesN(added)} added${reused ? `, ${reused} already saved` : ''}` })
    },
    replace: {
      title: 'Change proxy', lead: (name: string) => `Choose the proxy ${name} connects through.`, current: 'Current proxy', state: 'Status',
      pick: 'Pick', test: 'Check the chosen proxy', confirm: 'Change proxy',
      running: 'The profile is running; stop it to change its proxy.', stop: 'Stop profile', warn: 'After changing it, check the profile’s time zone and language.',
      done: (profile: string, proxy: string): News => ({ title: 'Proxy replaced', detail: `${profile} now connects through ${proxy}` })
    }
  },
  trash: {
    title: 'Trash', empty: 'The Trash is empty', emptyText: (n: number) => `Deleted profiles stay here for ${n} days and can be restored during that time.`,
    restore: 'Restore', restoreAll: 'Restore all', purge: 'Delete permanently', purgeAll: 'Empty Trash',
    cols: { profile: 'Profile', number: 'No.', group: 'Group', fingerprint: 'Fingerprint', signins: 'Sign-ins', deleted: 'Deleted', by: 'Deleted by', left: 'Days left' },
    filterLabels: { keyword: 'Keyword', by: 'Deleted by', when: 'Deleted' },
    search: 'Search name or number', when: 'Deleted between', anyone: 'Anyone', days: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
    picked: (n: number) => `${n} selected`, restoreTo: 'Restore to', restoreToHint: 'Unless another is picked, each goes back to its own group.', sameGroup: 'Its own group',
    restoreN: (n: number) => `Restore (${n})`, purgeN: (n: number) => `Delete permanently (${n})`,
    typeName: (name: string) => `Type ${name} to confirm`, typeCount: (n: number) => `Type ${n} to confirm`,
    sites: (n: number) => (n ? `${n} ${n === 1 ? 'site' : 'sites'}` : 'None'), byAt: (who: string, when: string) => `${who} deleted it ${when}`,
    confirmPurge: (n: number) => `Permanently delete ${profilesN(n)}?`, confirmNote: 'This can’t be undone: their fingerprints and settings can’t be recovered.',
    restored: (n: number): News => ({ title: 'Restored', detail: profilesN(n) }), purged: (n: number): News => ({ title: 'Permanently deleted', detail: profilesN(n) })
  },
  engines: {
    title: 'Engines',
    check: 'Check for updates', upToDate: 'Every engine is up to date', upToDateText: 'The installed engines are all on their latest versions.', updates: (n: number) => `${n === 1 ? '1 update' : `${n} updates`} available`,
    defaultKernel: 'Default engine', defaultOf: (engine: string) => `${engine} · recommended`, defaultSet: (v: string): News => ({ title: 'Default engine set', detail: `New profiles now start with ${v}` }),
    tabs: { all: 'All engines', installed: 'Downloaded', updates: 'Updates' },
    search: 'Search versions', searchPh: 'Search versions or notes', system: 'System', systems: 'All systems', filterLabels: { keyword: 'Keyword', system: 'Platform' },
    families: { win: 'Windows', mac: 'macOS', linux: 'Linux' },
    cols: { version: 'Engine', number: 'Version', platforms: 'Systems', size: 'Size', released: 'Released', profiles: 'Profiles', status: 'Status', actions: 'Actions' },
    recommended: 'Recommended', default: 'Default', installed: 'Downloaded', notDownloaded: 'Not downloaded', download: 'Download', failed: 'Download failed',
    downloadingPct: (pct: number) => `Downloading ${pct}%`, everywhere: (n: number) => `${n} in all workspaces`, actionsX: (v: string) => `Actions for ${v}`,
    setDefault: 'Make default', details: 'Details',
    remove: 'Delete from this computer', removeBusy: 'Can’t delete: a profile is running on it', removed: (v: string): News => ({ title: 'Deleted from this computer', detail: v }),
    retired: 'Retired', none: 'No version of this engine is built for this computer.',
    noneDownloaded: 'Nothing downloaded yet', noneDownloadedText: 'Download a version from All engines; a profile also downloads its own when it opens.',
    outdated: (n: number, kernel: string) => `${profilesN(n)} ${n === 1 ? 'uses' : 'use'} the older ${kernel}`, upgrade: (v: string) => `Upgrade to ${v}`,
    upgradeNote: (v: string) => `After the upgrade to ${v}, sites see the same fingerprint as before.`,
    upgradeSkip: (n: number) => (n === 1 ? '1 is running and stays as it is; upgrade it once it stops.' : `${n} are running and stay as they are; upgrade them once they stop.`),
    paused: (pct: number) => `Paused at ${pct}%`, pause: 'Pause', resume: 'Resume',
    disk: (size: string) => `Engines on this computer take ${size}`, cleanup: 'Delete unused versions', nothingToClean: 'Every downloaded version is in use or recommended.',
    cleanupTitle: (n: number) => `Delete ${n === 1 ? '1 unused version' : `${n} unused versions`}?`, cleanupNote: (size: string) => `Frees ${size}. A version downloads again if a profile needs it.`,
    cleaned: (n: number): News => ({ title: 'Unused versions deleted', detail: n === 1 ? '1 version' : `${n} versions` }),
    settings: 'Download settings', autoDownload: 'Download updates automatically', autoHint: 'Existing profiles keep their version',
    autoHelp: 'New recommended versions download to this computer in the background. Profiles stay on their version until you upgrade them.',
    idleOnly: 'Download only while idle',
    upgraded: (n: number, v: string): News => ({ title: 'Engine upgraded', detail: `${profilesN(n)} now ${n === 1 ? 'uses' : 'use'} ${v}` }),
    platforms: { 'win32-x64': 'Windows', 'darwin-arm64': 'macOS · Apple silicon', 'darwin-x64': 'macOS · Intel', 'linux-x64': 'Linux' } as Record<string, string>,
    notes: {
      title: 'Version notes', version: 'Version', released: 'Released', size: 'Size', profiles: 'Profiles', changes: 'What changed', none: 'No notes for this version.',
      systems: 'Systems', switchWarn: 'Stop the profiles involved before switching engines', switchWhy: 'That way their data is saved and nothing is lost.'
    },
    admin: {
      upload: 'Upload a version', title: 'Upload an engine version', kind: 'Engine', version: 'Version', versionPh: 'e.g., 151.0.7900.10', platform: 'System',
      file: 'Package', choose: 'Choose a file…', fileHint: 'The package as the engine publishes it: .zip, .tar.xz or .dmg. It goes straight to Folio’s storage.',
      hashing: (pct: number) => `Checking the file… ${pct}%`, uploading: (pct: number) => `Uploading… ${pct}%`, send: 'Upload', done: (v: string): News => ({ title: 'Added to the catalog', detail: v }),
      recommend: 'Make recommended', recommended: (v: string): News => ({ title: 'Now recommended', detail: v }), retire: 'Retire', unfinished: 'Upload unfinished',
      recommendTitle: (v: string) => `Make ${v} the recommended version?`, recommendNote: 'Workspaces without a default engine start new profiles on it; the note below shows in its version notes.', note: 'What changed (optional)',
      retireTitle: (v: string) => `Retire ${v} from the catalog?`,
      retireConfirm: (n: number) => `${n ? `${profilesN(n)} in all workspaces ${n === 1 ? 'uses' : 'use'} it. ` : ''}Computers that downloaded it keep it; elsewhere its profiles are offered another version.`,
      retiredDone: (v: string): News => ({ title: 'Retired from the catalog', detail: v })
    }
  },
  team: {
    title: 'Team',
    invite: 'Invite people', me: (name: string) => `${name} (you)`, remove: 'Remove from workspace', leave: 'Leave workspace',
    tabs: { members: 'Members', invites: 'Invitations', roles: 'Roles' },
    cols: { person: 'Member / email', role: 'Role', scope: 'Access', status: 'Status', active: 'Last active', actions: 'Actions', invitedBy: 'Invited by', expires: 'Expires' },
    seatsOf: (used: number, limit: number | null) => (limit === null ? `${used} seats in use, no limit` : `${used} of ${limit} seats in use`),
    protectedTag: 'Protected', access: 'Access', removeShort: 'Remove',
    filterLabels: { keyword: 'Keyword', role: 'Role' },
    scopeAll: 'All profiles', scopeOwn: 'Their own profiles', joined: 'Joined',
    seats: 'Seats', seatsFree: (n: number) => `${n} in use · unlimited`, allRoles: 'All roles', noInvites: 'No invitations waiting', noInvitesText: 'Invitations show here until they are accepted or expire.',
    defsTitle: 'What the roles mean', editAccess: 'Edit access', accessTitle: (e: string) => `Access for ${e}`,
    accessSub: 'The role is theirs across the workspace; the groups decide which profiles they can access.', saved: 'Access saved',
    viaParent: 'through its parent', noGroups: 'There are no groups yet.',
    search: 'Search members', meTag: '(you)', moreX: (e: string) => `More for ${e}`,
    copiedNew: { title: 'New invitation link copied', detail: 'The earlier link no longer works' },
    roleHelp: {
      owner: 'Has every permission: people, groups, every profile and the workspace’s settings. Can’t be changed.',
      admin: 'Sees and manages every profile, proxy and person, but can’t change the owner.',
      member: 'Sees and opens their own profiles and those in their groups; can create and edit, not delete.',
      viewer: 'Sees their own profiles and those in their groups; changes nothing.'
    } as Record<string, string>,
    roleActions: (n: number) => `${n} ${n === 1 ? 'permission' : 'permissions'}`,
    copyLink: 'Copy link', copied: 'Invitation link copied', resend: 'Send again', withdraw: 'Withdraw', withdrawn: 'Invitation withdrawn',
    inviteTitle: 'Invite people', email: 'Email', emailErr: 'Enter an email address.', role: 'Role',
    emails: 'Emails', emailsPh: 'name@company.com', emailsHint: 'Up to 10 at a time; press Enter or type a comma after each.',
    emailBad: (e: string) => `${e} isn’t an email address.`, tooMany: 'Invite up to 10 people at a time.', removeEmail: (e: string) => `Remove ${e}`,
    summaryTitle: 'What they will have access to', summaryAll: 'This role can access every profile in the workspace.',
    summaryGroups: (n: number) => `Their own profiles and those in the ${n === 1 ? 'group' : `${n} groups`} selected; the role decides what they may do.`,
    summaryOwn: 'Only the profiles given to them; the role decides what they may do.',
    validity: 'Link works for', days: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
    seatsAfter: (n: number, max: number) => `Seats after inviting: ${n} / ${max}`,
    send: 'Send invitation', sent: (e: string): News => ({ title: 'Invitation sent', detail: e }), notSent: { title: 'The email couldn’t be sent', detail: 'Copy the link and pass it on yourself' },
    sentShort: 'Invitation sent', notSentShort: 'Not emailed: copy the link and pass it on',
    done: 'Done',
    removeTitle: (e: string) => `Remove ${e}`, removeLead: 'Their profiles go to the person you choose. Anything they have open closes on their computer, and their copies there are deleted.',
    heir: 'Give their profiles to', heirNeeded: 'Choose who receives their profiles first.', removeDo: 'Remove from workspace', removed: (e: string): News => ({ title: 'Member removed', detail: e }),
    leaveTitle: (ws: string) => `Leave ${ws}?`, leaveLead: 'Your profiles there go to the owner, and you lose access to the workspace.', leaveDo: 'Leave',
    removedYou: (ws: string): News => ({ title: `You’re no longer in ${ws}`, detail: 'Its profiles were closed and removed from this computer' }),
    groupAccess: 'Group access',
    invites: 'Invitations to you', join: 'Join', decline: 'Decline', from: (who: string, role: string) => `From ${who}, as ${role}`
  },
  jobs: {
    title: 'Task center',
    live: 'Auto-refresh', kind: 'Type', range: 'Time',
    tabs: { all: 'All tasks', running: 'Running', done: 'Done', partial: 'Partly failed', canceled: 'Canceled' },
    kinds: { all: 'All types', 'proxy.check': 'Check proxies', 'profile.open': 'Open profiles', 'proxy.import': 'Import proxies', 'profile.edit': 'Edit profiles', 'kernel.download': 'Download engine' },
    ranges: { day: 'Last 24 hours', week: 'Last 7 days', month: 'Last 30 days', all: 'Any time' },
    cols: { name: 'Task', by: 'Started by', progress: 'Progress', status: 'Status', created: 'Created', actions: 'Actions', target: 'Target', result: 'Result', reason: 'Why it failed', at: 'Finished' },
    states: { running: 'Running', done: 'Done', partial: 'Partly failed', failed: 'Failed', canceled: 'Canceled' },
    results: { pending: 'Waiting', ok: 'Done', failed: 'Failed', canceled: 'Canceled' },
    me: 'You', view: 'View', empty: 'No tasks in this period', emptyText: 'The progress and results of batch operations, such as checking proxies or opening profiles, appear here.', by: (who: string) => `Started by ${who}`,
    total: 'Total', ok: 'Done', failed: 'Failed', canceled: 'Canceled', resultsTab: 'Results', logTab: 'Log',
    started: (n: number) => `Started on ${n === 1 ? '1 target' : `${n} targets`}`, finished: (s: string) => `Finished: ${s}`,
    retry: (n: number) => `Retry failed (${n})`, retryNote: 'Only the failed ones run again; the ones done stay as they are.',
    retryElsewhere: 'It ran on another computer: retry it there.', retryTheirs: 'Only whoever started it can retry it.',
    cancel: 'Cancel task', download: 'Download results', saved: (p: string): News => ({ title: 'Results saved', detail: p }),
    errors: { running: 'The profile was running', gone: 'The profile was deleted', paused: 'The download was paused', failed: 'Failed', canceled: 'Canceled' } as Record<string, string>
  },
  states: {
    noProfiles: 'No profiles yet', noProfilesText: 'Create one to set its fingerprint and proxy; each opens in a browser of its own.', create: 'Create profile',
    noMatch: 'Nothing matches', noMatchText: 'Try other words, or clear the filters.', clear: 'Clear filters',
    proxyDown: 'The proxy doesn’t respond', proxyDownText: (addr: string) => `${addr} couldn’t be reached. Check its details or the network, then check again.`,
    checkAgain: 'Check again', editProxy: 'Edit proxy',
    launchFailed: 'The profile didn’t start', launchFailedText: (n: string) => `${n} couldn’t start. Check its proxy, the network or its engine, then try again.`,
    why: 'See why', retry: 'Try again',
    noAccess: 'No access',
    noAccessText: (admin: string | null) => `Your role doesn’t include this. Ask ${admin ? `the workspace’s owner (${admin})` : 'whoever runs the workspace'} for access.`,
    contact: 'Email the owner', askSubject: 'Folio: access request',
    offline: 'No connection', offlineText: 'Folio can’t reach its server. Check your network, then connect again.', reconnect: 'Connect again',
    loadFailedText: 'Something went wrong while loading. Try again.',
    partial: (what: string) => `Some details couldn’t be loaded (${what}), so this list may be incomplete.`,
    lists: { profiles: 'profiles', trash: 'the Trash', groups: 'groups', proxies: 'proxies', members: 'members', flows: 'flows', tasks: 'scheduled tasks', extensions: 'extensions', jobs: 'tasks' } as Record<string, string>, listSep: ', ',
    underway: (what: string) => `${what}: under way`, resultsThere: 'The task center will have the results.', viewTask: 'View task',
    partly: (what: string, ok: number, failed: number): News => ({ title: `${what}: some failed`, detail: `${ok} done, ${failed} failed` }), view: 'View details'
  },
  rolesPage: {
    list: 'Roles', add: 'New role', note: 'A role decides what someone may do; the groups they are in decide which profiles.',
    descs: { owner: 'Built in, with every permission', admin: 'Manages the team and every resource', member: 'Uses the profiles in their groups', viewer: 'View only' } as Record<string, string>,
    customOf: (n: number) => `Custom role · ${n} ${n === 1 ? 'permission' : 'permissions'}`, customHint: 'A custom role for this workspace.',
    people: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`, ownerNote: 'The owner’s role always has every permission.',
    sections: { profiles: 'Profiles', data: 'Data', proxies: 'Proxies', team: 'Team' },
    perms: {
      'profiles.view': ['View profiles', 'See the profile list and each profile’s details'], 'profiles.create': ['Create profiles', 'Make new profiles'],
      'profiles.edit': ['Edit profiles', 'Change a profile’s settings'], 'profiles.open': ['Open profiles', 'Open and stop profiles'],
      'profiles.delete': ['Delete profiles', 'Move profiles to the Trash and delete them'],
      'cookies.import': ['Import cookies', 'Bring cookies into a profile'], 'cookies.export': ['Export cookies', 'Take a profile’s cookies out, and read their values'],
      'profiles.export': ['Export profiles', 'Export profiles with their settings and cookies'],
      'proxies.view': ['View proxies', 'See the proxy list and each proxy’s details'], 'proxies.bind': ['Assign proxies', 'Assign a proxy to a profile or unassign it'],
      'proxies.edit': ['Edit proxies', 'Add, change and delete proxies'],
      'team.manage': ['Manage the team', 'Invite and remove people, set roles and groups, and manage the workspace settings and plan'],
      'activity.view': ['View the activity log', 'See what the team has done']
    } as Record<string, [string, string]>,
    reset: 'Restore defaults', save: 'Save permissions', saved: (r: string): News => ({ title: 'Permissions saved', detail: r }),
    delete: 'Delete role', deleteTitle: (r: string) => `Delete the role ${r}?`, deleteNote: 'Only roles that no member holds and no pending invitation uses can be deleted.', deleted: (r: string): News => ({ title: 'Role deleted', detail: r }),
    newTitle: 'New role', name: 'Role name', nameErr: 'Enter a role name.', from: 'Start from', fromNone: 'No permissions', create: 'Create role'
  },
  activity: {
    title: 'Activity log', person: 'Person', everyone: 'Everyone', kind: 'Action',
    search: 'Search by name, person or entry number', cols: { time: 'Time', person: 'Person', type: 'Action', object: 'Target', what: 'What happened', view: 'Details' },
    filterLabels: { keyword: 'Keyword', person: 'Person', kind: 'Action', dates: 'Dates' }, view: 'View',
    kinds: { all: 'All actions', open: 'Opening and closing', profiles: 'Profile changes', trash: 'Trash', proxies: 'Proxies and groups', cookies: 'Cookies and exports', team: 'Team', extensions: 'Extensions', automation: 'Automation' },
    dates: 'Dates', from: 'From', until: 'Until', to: 'to',
    partial: 'Your role shows your own actions and what was done to the profiles you can see.',
    export: 'Export log', exported: (path: string): News => ({ title: 'Log exported', detail: path }), empty: 'Nothing recorded yet', emptyText: 'Changes to profiles, proxies, members and settings in this workspace are recorded here.', someone: 'Someone', recent: 'Recent activity', by: (who: string) => `by ${who}`,
    today: 'Today', yesterday: 'Yesterday',
    detail: {
      title: 'Entry details', number: 'Entry', person: 'By', time: 'Time', type: 'Action', object: 'Target', device: 'Computer', what: 'What happened',
      fields: 'What changed', change: 'Renamed', note: 'The log never keeps passwords or cookie values.',
      changes: { field: 'Field', from: 'Before', to: 'After' }, secret: 'Changed (not recorded)', changed: 'Changed', empty: 'Empty', on: 'On', off: 'Off'
    },
    types: {
      'profile.create': 'Create profile', 'profile.update': 'Edit profile', 'profile.move': 'Move to group', 'profile.tag': 'Add tag', 'profile.untag': 'Remove tag',
      'profile.set-proxy': 'Change proxy', 'profile.assign': 'Assign profile', 'profile.trash': 'Move to Trash', 'profile.restore': 'Restore profile', 'profile.purge': 'Delete permanently',
      'profile.open': 'Open profile', 'profile.close': 'Close profile', 'profile.takeover': 'Take over profile',
      'proxy.create': 'Add proxy', 'proxy.import': 'Import proxies', 'proxy.update': 'Edit proxy', 'proxy.delete': 'Delete proxy',
      'group.create': 'Create group', 'group.rename': 'Rename group', 'group.delete': 'Delete group', 'group.members': 'Group access',
      'member.invite': 'Invite', 'member.join': 'Join', 'member.role': 'Change role', 'member.groups': 'Change groups', 'member.remove': 'Remove member', 'member.leave': 'Leave workspace',
      'invitation.withdraw': 'Withdraw invitation', 'role.create': 'Create role', 'role.update': 'Edit role', 'role.delete': 'Delete role',
      'cookies.export': 'Export cookies', 'cookies.import': 'Import cookies', 'cookies.edit': 'Edit cookie', 'cookies.delete': 'Delete cookies', 'workspace.export': 'Export workspace', 'workspace.import': 'Import workspace',
      'flow.create': 'Create flow', 'flow.update': 'Edit flow', 'flow.delete': 'Delete flow', 'task.create': 'Create scheduled task', 'task.update': 'Edit scheduled task', 'task.delete': 'Delete scheduled task',
      'run.start': 'Start run', 'run.finish': 'Finish run', 'extension.add': 'Add extension', 'extension.update': 'Update extension', 'extension.delete': 'Delete extension',
      'profile.add-extension': 'Install extension', 'profile.remove-extension': 'Uninstall extension', 'profile.set-kernel': 'Change engine', 'profile.set-browser': 'Browser settings'
    } as Record<string, string>,
    actions: {
      'profile.create': p => `created ${p}`, 'profile.update': (p, x) => `changed the ${andList(uniq((x.fields ?? []).map((f: string) => enFields[f] ?? f)))} of ${p}`,
      'profile.move': (p, x) => (x.group ? `moved ${p} to ${x.group}` : `took ${p} out of its group`), 'profile.tag': (p, x) => `tagged ${p} “${x.tag}”`,
      'profile.untag': (p, x) => `removed the tag “${x.tag}” from ${p}`, 'profile.set-proxy': (p, x) => (x.proxy ? `set the proxy of ${p} to ${x.proxy}` : `removed the proxy of ${p}`),
      'profile.assign': (p, x) => (x.to ? `assigned ${p} to ${x.to}` : `unassigned ${p}`),
      'profile.trash': p => `moved ${p} to the Trash`, 'profile.restore': p => `restored ${p}`, 'profile.purge': p => `permanently deleted ${p}`,
      'profile.open': (p, x) => (x.via === 'api' ? `opened ${p} through the API` : `opened ${p}`), 'profile.close': p => `closed ${p}`, 'profile.takeover': (p, x) => `took over ${p} from ${x.from ?? 'another computer'}`,
      'proxy.create': (_p, x) => `added the proxy ${x.name}`, 'proxy.import': (_p, x) => `imported ${x.added} ${x.added === 1 ? 'proxy' : 'proxies'}`,
      'proxy.update': (_p, x) => `changed the proxy ${x.name}`, 'proxy.delete': (_p, x) => `deleted the proxy ${x.name}`,
      'group.members': (_p, x) => `changed who can access ${x.name}`,
      'group.create': (_p, x) => `created the group ${x.name}`, 'group.rename': (_p, x) => `renamed the group ${x.from} to ${x.name}`, 'group.delete': (_p, x) => `deleted the group ${x.name}`,
      'member.invite': (_p, x) => `invited ${x.email} as ${x.role}`, 'member.join': (_p, x) => `joined as ${x.role}`,
      'member.role': (_p, x) => `made ${x.email} ${x.role}`, 'member.groups': (_p, x) => `changed the groups ${x.email} can access`, 'member.remove': (_p, x) => `removed ${x.email}; their profiles went to ${x.to}`,
      'member.leave': () => 'left the workspace', 'invitation.withdraw': (_p, x) => `withdrew the invitation to ${x.email}`,
      'role.create': (_p, x) => `created the role ${x.name}`, 'role.update': (_p, x) => `changed what ${x.name} may do`, 'role.delete': (_p, x) => `deleted the role ${x.name}`,
      'cookies.delete': (p, x) => `deleted ${x.count} ${x.count === 1 ? 'cookie' : 'cookies'} from ${p}`,
      'cookies.export': (p, x) => `exported ${x.count} ${x.count === 1 ? 'cookie' : 'cookies'} from ${p}`, 'cookies.import': (p, x) => `imported ${x.count} ${x.count === 1 ? 'cookie' : 'cookies'} into ${p}`,
      'cookies.edit': (p, x) => `edited the cookie ${x.name} (${x.domain}) of ${p}`,
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
    passphrase: 'Passphrase', confirm: 'Confirm passphrase', passHelp: 'At least 10 characters. The file opens only with it, and it is not kept anywhere: if it is lost, so is the file.',
    passShort: 'Use at least 10 characters.', passMismatch: 'The two passphrases differ.', export: 'Export', exported: (path: string): News => ({ title: 'Profiles exported', detail: path }),
    importTitle: 'Import data', importLead: 'Brings a .folio file into this workspace: its profiles are added and numbered here, and identical proxies and same-named groups are reused.',
    choose: 'Choose a .folio file…', unlock: 'Unlock',
    preview: (p: { workspace: string; profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }) => `From ${p.workspace}: ${profilesN(p.profiles)} (${p.signedIn} with sign-ins), ${p.proxies} ${p.proxies === 1 ? 'proxy' : 'proxies'}, ${p.groups} ${p.groups === 1 ? 'group' : 'groups'}${p.extensions ? `, ${p.extensions} ${p.extensions === 1 ? 'extension' : 'extensions'}` : ''}.`,
    room: (free: number) => `The plan has room for ${profilesN(free)} more.`, import: 'Import',
    imported: (r: { profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }) : News => ({ title: 'Profiles imported', detail: `${profilesN(r.profiles)}, ${r.signedIn} with sign-ins; ${r.proxies} new ${r.proxies === 1 ? 'proxy' : 'proxies'}, ${r.groups} new ${r.groups === 1 ? 'group' : 'groups'}${r.extensions ? `, ${r.extensions} new ${r.extensions === 1 ? 'extension' : 'extensions'}` : ''}` })
  },
  flows: {
    title: 'Flows', new: 'New flow',
    template: 'Sign-in check template', templateName: 'Sign-in check',
    cols: { name: 'Flow', steps: 'Steps', by: 'Created by', updated: 'Changed' }, search: 'Search flows by name',
    emptyTitle: 'No flows yet', empty: 'A flow is a list of steps (open a page, click, type, extract…) that runs on one profile or many.',
    you: 'You', view: 'View', duplicate: 'Duplicate', duplicateToEdit: 'Duplicate to edit', delete: 'Delete', deleteX: (n: string) => `Delete ${n}`,
    inUse: (tasks: string) => `Used by ${tasks}; it can’t be deleted.`, confirmDelete: (n: string) => `Delete “${n}”?`, deleted: (n: string): News => ({ title: 'Flow deleted', detail: n }), copyName: (n: string) => `${n} (copy)`, untitled: 'New flow',
    back: 'Flows', backLabel: 'Back to flows', name: 'Flow name', nameNeeded: 'Give the flow a name.', save: 'Save', saving: 'Saving…', saved: 'Flow saved',
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
      signedHint: 'For example an avatar or account menu that only signed-in visitors see, or a “Sign in” button that only signed-out visitors see. A profile found signed out stops there; in a task, you also get a desktop notification.'
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
    title: 'Scheduled tasks', new: 'New task', needFlow: 'Make a flow first, on the Flows page.', search: 'Search tasks by name',
    emptyTitle: 'No tasks yet', empty: 'A task runs a flow on a set of profiles, a few at a time, and keeps each run’s results.',
    cols: { task: 'Task', profiles: 'Profiles', when: 'When', last: 'Last run', on: 'Runs on', by: 'Created by', profile: 'Profile', status: 'Result', attempts: 'Tries', time: 'Time', result: 'Details' },
    views: { label: 'View', list: 'List', calendar: 'Calendar' },
    here: 'This computer', starter: 'The computer that starts it', n: (n: number) => String(n),
    latest: (task: string) => `Latest run · ${task}`, took: (s: number) => (s < 60 ? `took ${s} s` : `took ${Math.floor(s / 60)} min ${s % 60} s`),
    calendar: {
      prev: 'Previous week', next: 'Next week', thisWeek: 'This week', none: 'No scheduled times this week.',
      range: (a: Date, b: Date) => `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString('en-US', a.getMonth() === b.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}, ${b.getFullYear()}`,
      at: (time: string, n: number) => `${time} · ${n}`
    },
    never: 'Not run yet', manual: 'Manual', next: (at: string) => `Next: ${at}`, done: 'Its time has passed', on: (device: string) => `On ${device}`,
    once: (at: string) => `Once, ${at}`, everyDay: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends', dayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    onlyOpen: 'Scheduled tasks run on their computer while Folio is open and logged in there; times missed are recorded, not run late.', enableStartup: 'Open Folio at startup',
    run: 'Run', runX: (n: string) => `Run ${n}`, stop: 'Stop', delete: 'Delete', deleteX: (n: string) => `Delete ${n}`,
    noProfilesHere: 'None of its profiles are yours to run.', runningElsewhere: 'It is running now.',
    confirmDelete: (n: string) => `Delete “${n}” and its runs?`, deleted: (n: string): News => ({ title: 'Task deleted', detail: n }), started: (n: string): News => ({ title: 'Started on this computer', detail: n }),
    saved: 'Task saved', stale: 'Someone changed this task in the meantime. Open it again and redo your change.',
    status: { running: 'Running', done: 'Finished', stopped: 'Stopped', interrupted: 'Interrupted', missed: 'Missed', busy: 'Skipped' },
    progress: (done: number, all: number) => `${done} of ${all} done`, elsewhere: (where: string) => `on ${where}`,
    counts: (c: { ok: number; failed: number; signed_out: number; skipped: number; canceled: number }) => [c.ok && `${c.ok} done`, c.signed_out && `${c.signed_out} signed out`, c.failed && `${c.failed} failed`, c.skipped && `${c.skipped} skipped`, c.canceled && `${c.canceled} not run`].filter(Boolean).join(' · ') || 'Nothing ran',
    back: 'Tasks', backLabel: 'Back to tasks', about: (flow: string, n: number, conc: number, retries: number) => `${flow} · ${profilesN(n)} · ${conc} at a time · ${retries === 0 ? 'no retries' : retries === 1 ? '1 retry' : `${retries} retries`}`,
    runs: 'Runs', noRuns: 'No runs yet.', triggers: { manual: 'Manual', rerun: 'Rerun', schedule: 'Scheduled' }, result: 'Run results',
    missedNote: (at: string, device: string) => `Nothing ran at ${at}: Folio wasn’t open and logged in on ${device || 'its computer'}, or the computer was asleep.`,
    busyNote: (at: string) => `Nothing ran at ${at}: the run before was still going.`, runNow: 'Run it now',
    startedBy: (who: string, device: string | null, when: string) => `${who}${device ? ` on ${device}` : ''}, ${when}`,
    rerun: (n: number) => `Rerun the ${n === 1 ? 'one' : n} that didn’t succeed`, export: 'Export CSV', exported: (path: string): News => ({ title: 'Runs exported', detail: path }),
    csv: { number: 'Number', profile: 'Profile', status: 'Result', attempts: 'Tries', problem: 'Problem' },
    item: { pending: 'Waiting', running: 'Running', ok: 'Done', failed: 'Failed', signed_out: 'Signed out', skipped: 'Skipped', canceled: 'Not run' },
    noLog: 'Nothing was logged.', attempt: (n: number) => `Try ${n}`, shotsWhere: (device: string) => (device ? `Screenshots are kept on ${device}.` : 'Screenshots are kept on the computer that ran it.'),
    skip: { locked: 'Open on another computer.', not_found: 'The profile no longer exists.', in_trash: 'The profile is in the Trash.', forbidden: 'Not one of your profiles anymore.', scripted: 'A script was driving it through the local API.' } as Record<string, string>,
    form: {
      newTitle: 'New task', editTitle: 'Edit task', create: 'Create task', save: 'Save changes', name: 'Name', flow: 'Flow',
      profiles: (n: number) => `Profiles · ${n} selected`, search: 'Search profiles', all: 'Select all shown', none: 'No profiles match.',
      concurrency: 'At a time', retries: 'When one fails', retriesN: (n: number) => (n === 0 ? 'Don’t retry' : n === 1 ? 'Retry once' : `Retry up to ${n} times`),
      timeout: 'Time limit per profile', minutes: (n: number) => (n === 1 ? '1 minute' : `${n} minutes`),
      memory: 'Each open profile takes roughly 300–500 MB of memory; set how many run at a time to suit this computer.',
      when: 'When it runs', kinds: { none: 'Manual', once: 'Once', daily: 'Daily' }, at: 'Date and time', time: 'Time', days: 'Days',
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
    server: 'Local API', serverLead: 'Scripts on this computer reach Folio at this address.', enable: 'On', listening: 'Listening on', off: 'Off. Turn it on to let scripts on this computer use it.', copy: 'Copy', copied: 'Copied',
    status: 'Status', running: 'Running', stopped: 'Off', failed: 'Not running', rate: 'Requests',
    errors: { port_in_use: 'Another program uses this port. Pick another one.', listen_failed: 'The API couldn’t start on this port. Pick another one.' },
    port: 'Port', limit: 'Up to 60 requests a minute (starting, stopping, looking things up). What scripts send to the browser itself isn’t counted. Company is unthrottled.',
    unthrottled: 'Company plan: no limit on requests.',
    security: 'The debugging address has no password: while a profile opened through the API is running, any program on this computer can control it. Profiles you open yourself have no debugging address.',
    tokens: 'Tokens', tokensLead: 'Each script signs in with a token; revoking one cuts off whatever uses it.',
    noTokens: 'No tokens yet', noTokensText: 'Create one for each script or service that calls the API.',
    newToken: 'Copy this token now; it isn’t shown again.', done: 'Done', tokenName: 'e.g., order sync', createToken: 'Create token', defaultName: 'Token',
    nameLabel: 'Token name', nameHint: 'Name it after the script that uses it, so you know which one to revoke.',
    unused: 'Not used yet', revoke: 'Revoke', revokeX: (n: string) => `Revoke ${n}`, otherWorkspace: 'Another workspace',
    cols: { name: 'Name', workspace: 'Workspace', created: 'Created', used: 'Last used', actions: 'Actions', time: 'Time', method: 'Method', path: 'Path', status: 'Status', token: 'Token' },
    examples: 'Examples', exampleNames: { playwright: 'Playwright', puppeteer: 'Puppeteer', selenium: 'Selenium', firefox: 'Firefox profiles' },
    copyAddress: 'Copy address', limited: 'over the limit',
    placeholder: 'Replace <token> with one of your tokens; a token is shown only when it is created.',
    calls: 'Recent calls', callsLead: 'The latest calls from scripts, as they happen.', noCalls: 'No script has called it yet. Calls show up here as they happen.', noToken: 'No valid token',
    offTitle: 'The local API is off', noCallsTitle: 'No calls yet'
  },
  extensions: {
    title: 'Extensions', add: 'Add extension',
    memberNote: 'The owner and admins manage the library. You can install its extensions in your own profiles, from the profile form or the bulk actions.',
    emptyTitle: 'No extensions yet', empty: 'Add one from a file or its store, then install it in profiles.',
    cols: { name: 'Extension', engine: 'Engine', version: 'Version', signature: 'Signature', profiles: 'Profiles', updated: 'Changed' },
    search: 'Search extensions', inProfiles: (n: number) => profilesN(n),
    install: 'Install in profiles…', installTitle: (n: string) => `Install ${n}`, installMany: (n: number) => `Install ${n} extensions`,
    installDo: (n: number) => (n ? `Install in ${profilesN(n)}` : 'Install'), installedHere: 'Installed', noProfiles: 'No profiles of this engine yet.',
    deleteNote: 'Profiles keep working without it; it can be added again later.',
    uploaded: 'Uploaded file', update: 'New version', delete: 'Delete', deleteX: (n: string) => `Delete ${n}`,
    signed: 'Signature checked', signedNote: 'Before installing it in a profile, Folio checks the package against its signature and checksum, and leaves it out if either fails.',
    confirmDelete: (n: string, count: number) => (count ? `Delete “${n}”? It will be uninstalled from ${profilesN(count)}.` : `Delete “${n}”?`),
    deleted: (n: string): News => ({ title: 'Extension deleted', detail: n }), added: (n: string): News => ({ title: 'Added to the library', detail: n }), updated: (n: string): News => ({ title: 'Extension updated', detail: `${n} · profiles get it the next time they open` }),
    addTitle: 'Add extension', updateTitle: (n: string) => `New version of ${n}`, from: 'From', fromLink: 'Link', fromFile: 'File',
    chooseFile: 'Choose a file…', fileHintChromium: 'A .crx or .zip with manifest.json at the top.', fileHintFirefox: 'An .xpi (or .zip) with manifest.json at the top.',
    storeChromium: 'Store link, extension ID or download link', storeFirefox: 'Add-on link, short name or download link',
    linkHintChromium: 'A download link ends in .crx or .zip.', linkHintFirefox: 'A download link ends in .xpi or .zip.',
    idNote: 'Folio gives the extension a key of its own so it has the same ID on every computer and its data can follow the profile. Its ID differs from the store’s, which a few extensions that pair with a desktop program or a site rely on.',
    uuidNote: 'Each profile gets its own internal address for the add-on, so sites can’t link profiles through it.',
    addDo: 'Add', updateDo: 'Upload', uploading: 'Uploading…', fetching: 'Downloading…',
    failedCheck: (profile: string, names: string[]): News => ({ title: 'Integrity check failed', detail: `${profile} opened without ${names.join(', ')}: ${names.length === 1 ? 'it' : 'they'} didn’t pass the integrity check.` })
  },
  windowSync: {
    title: 'Window sync', on: 'Window sync is on.', onBadge: 'On',
    summary: (leader: string, n: number) => `${leader} leads and ${n === 1 ? '1 window follows' : `${n} windows follow`}.`,
    leaderTag: 'Leader', followerTag: 'Sync', makeLeader: 'Make leader', stop: 'Stop sync', current: 'Syncing now',
    address: 'Address for every window', addressPh: 'Open an address in every window', open: 'Open',
    pick: 'Pick the windows',
    running: 'Open', start: (n: number) => (n < 2 ? 'Pick at least two' : `Sync ${n} windows`),
    ops: { label: 'Repeat', click: 'Clicks', typing: 'Typing', scroll: 'Scrolling' },
    delay: 'Random pause', seconds: 's', delayMin: 'Shortest pause, in seconds', delayMax: 'Longest pause, in seconds',
    synced: (n: number, bad: number) => `${n === 1 ? '1 window' : `${n} windows`} in sync${bad ? ` · ${bad} with a problem` : ''}`,
    workHere: 'Work here', inSync: 'In sync', shotWait: 'Waiting for a preview…',
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
    // The Free plan's page, as the user drew it (10-28).
    upsell: {
      title: 'One action, every window', lead: 'Clicks, typing and page actions in the leader window repeat in the others.',
      features: [['Synced actions', 'Clicks, typing, keys and scrolling'], ['Synced pages', 'Addresses and tabs follow along'], ['Tiled windows', 'Laid out in one click, all in view']] as [string, string][],
      unlock: 'Upgrade to unlock', guide: 'Read the guide', now: (plan: string) => `Current plan: ${plan} · upgrade to use window sync`,
      ask: 'Ask the owner or an admin to upgrade', art: { leader: 'Leader', follower: 'Follower', action: 'Synced' }
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
    title: 'Command palette', placeholder: 'Search profiles, proxies, members, pages or actions', groups: { profiles: 'Profiles', proxies: 'Proxies', members: 'Members', actions: 'Actions', pages: 'Pages' },
    none: 'Nothing matches.', move: 'select', run: 'run', close: 'close', open: 'open', switchTo: 'switch to its window', stop: (n: string) => `Stop ${n}`,
    newProfile: 'New profile', importProfiles: 'Import profiles', checkProxies: 'Check all proxies', addProxy: 'Add proxy',
    switchWs: (n: string) => `Switch to ${n}`, language: 'Switch to Chinese'
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
    run: 'Health check', running: 'Checking…', title: (n: string) => `Health check · ${n}`, card: 'Folio · Health check', passed: 'Passed', review: 'Review',
    last: (when: string, ok: boolean) => `Last health check ${when}: ${ok ? 'passed' : 'needs attention'}`, view: 'View report', again: 'Check again',
    lead: 'Opens a check page in the profile’s browser and reads what sites can see.', failed: 'The health check couldn’t run in this profile.',
    seen: 'Seen: ', want: 'expected: ', none: 'none',
    checks: {
      webrtc: { t: 'WebRTC shows no other address', fix: 'A real or local address leaked through WebRTC. Check that the profile has a proxy and opens through it.' },
      timezone: { t: 'Time zone matches the exit', fix: 'Set the time zone to follow the proxy, in Edit.' },
      language: { t: 'Language matches the exit', fix: 'Set the language to follow the proxy, in Edit.' },
      ua: { t: 'User-Agent matches the system', fix: 'The browser reports another system than the profile’s. Regenerate its fingerprint.' },
      canvas: { t: 'Canvas drawing is unique in the workspace', fix: 'Another profile draws canvas the same way. Regenerate the fingerprint of one of them.' },
      webgl: { t: 'WebGL', fix: '' }
    }
  },
  errors: {
    invalid_credentials: 'The email or password is incorrect.',
    wrong_password: 'The current password isn’t right.',
    unauthenticated: 'Your session has ended. Log in again.',
    rate_limited: 'Too many attempts. Wait a minute and try again.',
    validation: 'Enter your email and password.',
    network: 'Can’t reach Folio. Check your connection and try again.',
    internal: 'Something went wrong on our side. Try again.',
    plan_limit: 'The plan has no room for more profiles. Move some to the Trash or add profiles to the plan.',
    group_exists: 'There’s already a group with that name.',
    bad_reference: 'That group, proxy or person is no longer in the workspace. Pick another one.',
    forbidden: 'Your role doesn’t allow that. Ask the owner or an admin.',
    seat_limit: 'The plan has no free seat. Upgrade it to invite more people.',
    already_member: 'This person is already on the team.',
    group_cycle: 'A group can’t be moved into itself or one of its subgroups.',
    plan_required: 'Giving members access to a group is part of the Company plan.',
    owner: 'The owner stays on the team and keeps their role.',
    wrong_account: 'This invitation is for a different email address.',
    email_unverified: 'Verify your email address on the Folio website first.',
    invitation_expired: 'This invitation has expired. Ask for a new one.',
    local_only: 'This profile keeps its sign-ins on the computer that uses it. Open it there to export or import cookies.',
    cookies_unreadable: 'No cookies found in that file. Use JSON (Cookie-Editor, EditThisCookie) or cookies.txt.',
    locked: 'This profile is open on another computer.',
    not_found: 'Nothing has been saved for this profile yet.',
    wrong_passphrase: 'That passphrase doesn’t open this file.',
    not_folio: 'That isn’t a Folio export file.',
    passphrase_short: 'Use a passphrase of at least 10 characters.',
    flow_too_deep: 'Steps can nest four levels deep at most.',
    flow_too_long: 'A flow can have up to 300 steps.',
    flow_in_use: 'Tasks use this flow. Delete them, or have them use another flow, first.',
    task_running: 'This task is already running.',
    no_profiles: 'None of this task’s profiles can run (they are gone, in the Trash, or not yours).',
    run_finished: 'This run has already finished.',
    extension_exists: 'This extension is already in the library. Upload the new version to it instead.',
    extension_mismatch: 'That package is a different extension.',
    extension_unreadable: 'That isn’t a readable extension package (crx, zip or xpi with manifest.json at the top).',
    extension_kernel: 'That extension is made for the other engine.',
    store_ref: 'That isn’t a store link, an extension ID or a download link.',
    store_failed: 'The extension couldn’t be downloaded. Check the address, or download it and choose the file.',
    no_device: 'Log out and back in to this app once before scheduling tasks on this computer.',
    already_run: 'This scheduled time has already run.',
    kernel_exists: 'This version is already in the catalog for that system.',
    upload_incomplete: 'The upload didn’t finish. Upload the file again.',
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
    demo: [['US-Store-01', '西雅图'], ['UK-Shop-01', '伦敦'], ['JP-Social-01', '东京']] as [string, string][]
  },
  nav: { profiles: '环境管理', proxies: '代理管理', extensions: '扩展管理', flows: '流程', sync: '窗口同步', tasks: '定时任务', api: 'API 与脚本', team: '团队成员', activity: '操作日志', jobs: '任务中心', trash: '回收站', engines: '内核管理', groups: '分组管理', settings: '设置', billing: '套餐与用量', help: '帮助中心', more: '更多' },
  top: {
    search: '搜索环境、代理或成员…', bell: '通知', bellNew: '通知（有新消息）', none: '暂无通知',
    planEnds: (plan: string, date: string) => `${plan}将于 ${date} 到期，续费后可继续使用当前额度。`, trialEnds: (date: string) => `免费试用将于 ${date} 结束。`,
    renew: '续费', choosePlan: '选择套餐', invited: (who: string, ws: string) => `${who} 邀请您加入工作空间「${ws}」。`,
    jobFailed: (kind: string, n: number, total: number) => `${kind}：${total} 项中有 ${n} 项失败。`,
    trashKept: (n: number, manager: boolean) => `删除的环境在回收站保留 ${n} 天，到期后永久删除${manager ? '，保留天数可在设置中修改。' : '；如需恢复，请联系所有者或管理员。'}`,
    openTrash: '查看回收站'
  },
  groups: {
    title: '分组管理', all: '全部分组', none: '未分组', add: '新建分组', namePh: '请输入分组名称',
    color: '分组颜色', colors: { red: '红色', blue: '蓝色', green: '绿色', amber: '琥珀色', purple: '紫色', teal: '青色', gray: '灰色' },
    tree: '分组目录', everything: '全部环境',
    sum: (n: number, m: number | null) => `包含 ${n} 个环境${m === null ? '' : ` · ${m} 位成员`}`,
    expand: (g: string) => `展开 ${g}`, collapse: (g: string) => `收起 ${g}`,
    edit: '编辑分组', addProfile: '添加环境', search: '搜索环境名称或 ID', state: '状态', owner: '所属成员', owners: '全部成员', sort: '按名称排序',
    states: { all: '全部状态', running: '运行中', stopped: '已停止' },
    cols: { name: '环境名称', number: '环境 ID', region: '国家/地区', status: '状态', owner: '负责人' },
    empty: '该分组暂无环境', emptyText: '可在此分组中新建环境，或从环境列表将环境移入此分组。', move: '移动到分组…', moveOut: '移出分组', movedOut: (n: number): News => ({ title: '已移出分组', detail: `${n} 个环境` }),
    settings: '分组设置', name: '分组名称', nameErr: '请填写分组名称。', parent: '上级分组', parentNone: '无（顶级分组）', description: '分组说明',
    members: '成员权限', people: '分组成员', addMember: '添加成员', findMember: '搜索成员', noneToAdd: '所有成员均已在该分组中。',
    roleOf: (e: string) => `${e} 的角色`, removeMember: (e: string) => `移除 ${e}`,
    roleNote: '角色在整个工作空间内生效，分组决定成员可访问的环境范围。',
    companyOnly: '为分组授权成员是公司版功能。',
    access: '权限设置', inherit: '继承上级分组权限', inheritHint: '开启后，上级分组的成员也可访问本分组的环境。',
    save: '保存设置', saved: '分组设置已保存', delete: '删除分组',
    deleteTitle: (g: string) => `删除「${g}」？`, moveTo: '迁移目标', moveDelete: '迁移并删除',
    deleteHas: (g: string, n: number) => `「${g}」包含 ${n} 个环境，删除前请选择这些环境的迁移去向。`,
    deleteNote: '本操作仅删除分组结构，不删除环境；成员对迁移后环境的访问权限按新分组重新计算。', deleteEmpty: '该分组内没有环境，删除后仅移除分组结构。',
    deleteKids: (n: number) => `其下 ${n} 个子分组将上移一级。`,
    deleted: (g: string): News => ({ title: '分组已删除', detail: g }),
    newTitle: '新建分组', create: '创建分组', created: (g: string): News => ({ title: '分组已创建', detail: g }),
    createHint: '创建后可添加浏览器环境', rolesTitle: '权限说明'
  },
  plans: { free: '体验版', studio: '工作室版', company: '公司版' },
  periods: { monthly: '月付', yearly: '年付' },
  roles: { owner: '所有者', admin: '管理员', member: '成员', viewer: '仅查看' },
  ws: { switch: '切换工作空间', current: '当前工作空间' },
  plan: {
    usage: (used: number, limit: number) => `已用 ${used} / ${limit} 个环境`,
    renews: (date: string, period: string) => `${date} 续费 · ${period}`,
    ends: (date: string) => `${date} 到期`,
    trialEnds: (date: string) => `试用于 ${date} 结束`,
    scheduled: (plan: string, date: string) => `${date} 起变更为${plan}`,
    upgrade: '升级', addProfiles: '增加环境', manage: '账单'
  },
  billing: {
    title: '套餐与用量',
    tabs: { plan: '当前套餐', usage: '用量', payments: '账单记录' },
    current: '当前套餐', change: '变更套餐', since: '生效时间', until: '到期时间', renew: '自动续期',
    yes: '已开启', no: '未开启', status: '套餐状态', statusActive: '正常使用', statusTrial: '试用中',
    limits: '资源额度', profiles: '环境', members: '席位', proxies: '代理', logDays: '操作日志',
    details: '套餐详情', planRow: '套餐方案', all: '查看全部',
    logKept: (n: number) => `保留 ${n} 天`, unlimited: '不限',
    expiry: '到期提醒', expiryHint: '在套餐临近到期时，通过站内通知提醒管理员。',
    payments: '账单记录', invoice: '发票号', date: '创建时间', item: '项目', amount: '金额', paid: '已支付', refunded: '已退款',
    open: '查看', none: '暂无账单记录', noneHint: '未来的账单记录将显示在这里，便于您随时查看。'
  },
  settings: {
    title: '设置',
    tabs: { workspace: '工作空间', defaults: '环境默认值', opening: '启动偏好', notices: '通知设置', data: '数据', billing: '套餐与用量' },
    basics: '基础信息', basicsLead: '管理工作空间的名称、标识和所有者信息。',
    name: '工作空间名称', id: '工作空间 ID', idHint: '工作空间 ID 用于标识该工作空间，创建后不可修改。',
    owner: '所有者', ownerHint: '工作空间的创建者。',
    defaults: '环境默认值', defaultsLead: '设置后续创建环境时的默认配置。',
    defaultsNote: '环境默认值仅应用于后续创建的环境，不会影响已有的环境。',
    trashDays: '回收站保留时间', trashDaysHint: '在回收站中超过该时间的环境将连同登录状态被彻底删除。',
    engine: '默认内核', engineNone: '使用推荐版本', engineAuto: '使用推荐内核', engineHint: '创建环境时默认使用的浏览器内核。',
    groupHint: '创建环境时默认所属的分组。', proxyHint: '创建环境时默认使用的代理。',
    readOnly: '仅所有者和管理员可修改工作空间设置。', idCopied: '已复制工作空间 ID',
    group: '默认分组', groupNone: '未分组', proxy: '默认代理', proxyNone: '不使用代理',
    opening: '启动偏好', openingLead: '设置环境启动和关闭时的默认行为。',
    openDetail: '启动后打开环境详情', openDetailHint: '浏览器启动后自动打开该环境的详情页。',
    stopOnClose: '关闭窗口后停止环境', stopOnCloseHint: '关闭此项后，关闭浏览器窗口时环境继续运行：点「进入」重新打开窗口，点「停止」才结束并保存登录状态。',
    notices: '通知设置', noticesLead: '选择需要接收的提醒，以桌面通知和铃铛显示。该设置随账号生效。',
    notifyItems: { taskDone: '任务完成通知', taskFailed: '任务失败通知', proxyDown: '代理异常通知', productUpdate: '产品更新通知' },
    on: '开启', off: '关闭', workspaceNotices: '工作空间提醒',
    expiry: '套餐临近到期时提醒',
    data: '导出与导入', dataLead: '将整个工作空间的环境、代理、分组与登录状态导出为一个加密文件，或从文件导入。',
    saved: '设置已保存', save: '保存修改'
  },
  account: {
    title: '个人资料',
    menu: { profile: '个人资料', password: '修改密码', switch: '切换工作空间', logout: '退出登录' },
    info: '账号信息', displayName: '显示名称', displayNameHint: '团队成员、操作日志与负责人处显示该名称。', email: '账号邮箱', note: '备注', notePh: '例如：店铺运营',
    emailNote: '邮箱用于登录，如需修改请前往官网账户页。', nameErr: '请输入显示名称。', saved: '个人资料已保存',
    password: { current: '当前密码', next: '新密码', confirm: '确认新密码', rule: '8–64 个字符。', currentErr: '请输入当前密码。', short: '密码需为 8–64 个字符。', mismatch: '两次输入的新密码不一致。', done: { title: '密码已修改', detail: '其他设备上的登录已退出' } },
    switchDlg: { title: '切换工作空间', field: '工作空间', note: '切换仅改变当前查看的资源，不会迁移环境。未保存的修改请在切换前处理。', invites: '待接受的邀请', go: '切换' },
    logoutDlg: {
      title: '退出登录', ask: '是否退出当前账号？',
      running: (profiles: number, runs: number) => [profiles ? `${profiles} 个运行中的环境将保存登录状态后关闭` : '', runs ? `${runs} 个流程或定时任务将中止` : ''].filter(Boolean).join('，') + '。',
      sync: '窗口同步将停止。', go: '退出登录'
    },
    version: (v: string) => `Folio ${v}`, save: '保存修改'
  },
  user: {
    account: '账户', manage: '管理账号', teams: '团队', settings: '设置', data: '数据', language: '语言',
    langs: { en: 'English', zh: '简体中文' },
    exportAll: '导出全部数据…', importAll: '导入数据…', logout: '退出登录',
    startup: '开机自动启动', startupHint: '开机后最小化到托盘，定时任务照常运行。'
  },
  tray: { open: '打开 Folio', quit: '退出 Folio', background: 'Folio 将在后台运行，以确保定时任务按时执行。如需退出，请使用托盘图标。' },
  notify: {
    signedOut: (task: string, names: string[]) => ({ title: names.length === 1 ? `${names[0]} 已掉线` : `${names.length} 个环境已掉线`, body: `${task}：${names.join('、')}` }),
    taskDone: (kind: string, n: number) => ({ title: `${kind}已完成`, body: `共 ${n} 项。` }),
    taskFailed: (kind: string, failed: number, total: number) => ({ title: `${kind}：${failed} 项失败`, body: `${total} 项中有 ${failed} 项失败，可在任务中心查看原因。` }),
    proxyDown: (name: string, why: string) => ({ title: `代理 ${name} 连接失败`, body: why }),
    productUpdate: (v: string) => ({ title: `Folio ${v} 已发布`, body: '可在侧栏完成更新。' })
  },
  update: {
    ready: (v: string) => `Folio ${v} 已下载完成。`, restart: '重启并更新', restartNote: '将先保存并关闭已打开的环境；如不重启，将在下次退出 Folio 时自动安装。',
    out: (v: string) => `Folio ${v} 已发布。`, download: '前往下载'
  },
  common: {
    cancel: '取消', save: '保存', close: '关闭', undo: '撤销', check: '检测', checking: '检测中…', edit: '编辑', copy: '复制', copied: '已复制',
    picked: { profiles: (n: number) => `已选择 ${n} 个环境`, proxies: (n: number) => `已选择 ${n} 个代理`, extensions: (n: number) => `已选择 ${n} 个扩展`, cookies: (n: number) => `已选择 ${n} 个 Cookie` }, clearSelection: '取消选择', selectAll: '选择当前页', select: (x: string) => `选择 ${x}`,
    never: '从未', justNow: '刚刚', runDays: (days: number, h: number) => `${days} 天 ${h} 小时`, minAgo: (n: number) => `${n} 分钟前`, hAgo: (n: number) => `${n} 小时前`, yesterday: '昨天', daysAgo: (n: number) => `${n} 天前`,
    loadFailed: '列表加载失败', loadRetry: '重新加载', resize: '调整面板宽度',
    discardTitle: '放弃未保存的修改？', discardNote: '关闭后，本次的修改将不会保存。', keepEditing: '继续编辑', discard: '放弃修改',
    listLoading: '加载中…', listFailed: '列表加载失败。', retry: '重试', noOptions: '暂无可选项', noMatch: '无匹配结果',
    attribution: 'IP Geolocation by DB-IP'
  },
  os: { windows: 'Windows', macos: 'macOS', linux: 'Linux' },
  profiles: {
    title: '环境管理', count: (n: number) => `${n} 个环境`,
    search: '搜索环境', searchPh: '搜索名称、编号、城市或标签', new: '创建环境', import: '导入',
    sum: {
      running: '运行中', proxy: '代理异常', proxyOk: '全部代理连接正常',
      proxyNote: (down: number, slow: number) => [down && `${down} 个无响应`, slow && `${slow} 个较慢`].filter(Boolean).join(' · '),
      risks: '关联风险', risksOk: '未发现关联风险'
    },
    views: { label: '视图', list: '列表', cards: '卡片' },
    tabs: { all: '全部', running: '运行中', stopped: '已停止', trash: '回收站' },
    filter: { label: '状态', all: '全部', states: '全部状态', running: '运行中', stopped: '已停止', issues: '需处理', starred: '已收藏', engine: '内核', engines: '全部内核' },
    reset: '重置', resetN: (n: number) => `重置（${n}）`,
    filterLabels: { keyword: '关键词', group: '分组', engine: '内核', status: '状态' },
    page: { total: (n: number) => `共 ${n} 条记录`, size: (n: number) => `每页 ${n} 条`, prev: '上一页', next: '下一页', go: (p: number) => `第 ${p} 页` },
    star: '收藏', unstar: '取消收藏', move: '移动分组', moveTitle: (n: string) => `将「${n}」移到分组`,
    sort: '排序', sorts: { recent: '最近打开', name: '名称 A–Z', latency: '代理延迟' },
    cols: { profile: '名称 / 编号', group: '分组', tags: '标签', engine: '内核 / 系统', proxy: '代理 / 地区', extensions: '扩展', last: '最近使用', status: '状态', actions: '操作' },
    extensionsN: (n: number) => `${n} 个扩展`,
    open: '启动', stop: '停止', enter: '进入', actionsX: (n: string) => `${n} 的操作`, starting: '启动中…', inUse: '正在使用',
    st: { idle: '已停止', running: '运行中', noWindow: '运行中 · 窗口已关闭', proxyDown: '代理异常' }, checkProxy: '检测代理',
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
    emptyMatch: '无符合条件的环境', emptyFor: (q: string) => `未找到「${q}」。`,
    emptyHint: (n: number) => `请更换关键词，或清除筛选查看全部 ${n} 个环境。`,
    bulk: {
      title: '批量操作', open: '批量启动', stop: '停止', openSkip: (n: number) => `已运行或在其他电脑使用的 ${n} 个将跳过`, hidden: (n: number) => `${n} 个被筛选隐藏`, stopSkip: (n: number) => `未在本机运行的 ${n} 个将跳过`, move: '移动分组', edit: '批量编辑…', more: '更多',
      trash: '移至回收站', cookies: '导出 Cookie…', sync: '同步窗口',
      confirm: (n: number) => `将 ${n} 个环境移至回收站？`, confirmNote: '运行中的环境将先停止，此操作可撤销。', doTrash: '移至回收站'
    },
    done: {
      trashed: (n: number): News => ({ title: '已移至回收站', detail: `${n} 个环境` }), moved: (n: number, g: string): News => ({ title: `已移至「${g}」`, detail: `${n} 个环境` }),
      starred: (n: number): News => ({ title: '已收藏', detail: `${n} 个环境` }), unstarred: (n: number): News => ({ title: '已取消收藏', detail: `${n} 个环境` }),
      created: '环境已创建', saved: '修改已保存',
      stale: '该环境刚被他人修改，请重试。',
      extAdded: (n: number, x: string, skipped: number): News => ({ title: '扩展已安装', detail: `${x} · ${n} 个环境${skipped ? `，跳过 ${skipped} 个（内核不符或已安装）` : ''}` }),
      syncing: (leader: string, n: number): News => ({ title: '窗口同步已开始', detail: `${leader} 主控 · ${n} 个窗口跟随` }), syncFailed: '窗口同步需要至少两个已打开的环境。'
    }
  },
  bulkEdit: {
    title: '批量编辑环境', lead: (n: number) => `已选择 ${n} 个环境`,
    group: '所属分组', groupHint: '将选中环境移动到指定分组。',
    proxy: '代理配置', proxyHint: '将选中环境应用此代理配置。',
    engine: '浏览器内核', engineHint: '将选中环境（同类内核）改为此版本。',
    start: '启动页', startHint: '选中环境启动时打开的页面。', startPh: 'https://',
    tags: '标签', tagsHint: '多个标签用逗号分隔。', add: '添加', remove: '移除', addTags: '添加标签', removeTags: '移除标签',
    owner: '负责人', ownerHint: '将选中环境分配给此成员。',
    ext: '扩展', extHint: '只作用于同类内核的环境。', pickExt: '请选择扩展', install: '安装', uninstall: '卸载',
    searchHint: '地址栏与新标签页使用的搜索引擎。', tabsHint: '启动时是否打开上次关闭时的标签页。',
    keep: '保持不变', changes: '本次将修改', none: '尚未选择要修改的项目。',
    picked: (n: number) => `已选择的环境（${n}）`, running: (n: number) => `其中 ${n} 个环境正在运行，暂不可修改。`,
    stoppedOnly: '仅更新已停止的环境', stoppedOnlyHint: '运行中的环境在关闭前保持原设置。',
    counts: (ok: number, skip: number) => `可更新 ${ok} 个 · 跳过 ${skip} 个`,
    submit: (n: number) => `更新 ${n} 个环境`, done: (n: number): News => ({ title: '环境已更新', detail: `${n} 个环境` })
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
    profile: '环境详情', crumbs: '当前位置', basics: '基础信息', proxyCard: '代理信息', dataCard: '环境数据', manage: '管理',
    viewAll: '查看全部', lastOpened: '最近使用', synced: '最近同步', answered: (ms: number) => `连接正常 · ${ms} ms`,
    openProfile: '启动环境', edit: '编辑', editProfile: '编辑环境', trash: '移至回收站', viewProxy: '查看代理详情',
    notChecked: '尚未检测出口', noExit: '代理无响应', direct: '直连',
    tabs: { overview: '概览', fingerprint: '指纹配置', cookies: 'Cookie 管理', activity: '操作记录' }, more: '更多操作', fingerprint: '指纹摘要',
    verdict: { ok: '全部一致', warn: '需要处理', bad: '无法打开' },
    fields: {
      name: '环境名称', number: '环境编号', lang: '语言', tz: '时区', os: '操作系统', engine: '使用内核', window: '启动窗口',
      proxyName: '代理名称', proxyType: '类型与地址', ip: '出口 IP', state: '连接状态', checked: '上次检测'
    },
    hostTz: '跟随本机',
    checksTitle: '一致性检查', notes: '备注', status: { ok: '通过', todo: '待处理', warn: '警告', bad: '问题' },
    cookies: 'Cookie', siteData: '网站存储', sites: '站点', extensions: '扩展', noExtensions: '未安装',
    notSaved: '尚未保存。浏览器关闭时将自动保存登录状态。', localOnly: '仅保存在使用该环境的电脑上，Folio 不保留副本。',
    json: 'JSON', netscape: 'cookies.txt',
    exported: (n: number, path: string): News => ({ title: 'Cookie 已导出', detail: `${n} 个环境 · ${path}` }), imported: (n: number): News => ({ title: 'Cookie 已导入', detail: `${n} 个` }),
    inUse: '正在其他电脑上使用', away: (device: string, email: string, since: string) => `${since} 起在 ${device}（${email}）上打开。`,
    takeover: '收回', takeoverNote: '对方的浏览器将被关闭，其最近几分钟内的改动将丢失。', takeoverDo: '收回并打开'
  },
  cookies: {
    title: '管理当前环境的 Cookie 数据', search: '搜索域名或名称', domain: '域名', allDomains: '全部域名',
    count: (n: number) => `共 ${n} 条 Cookie`, synced: (when: string) => `最近同步 ${when}`, reload: '重新加载',
    export: '导出', import: '导入 Cookie',
    cols: { name: '名称', domain: '域名', path: '路径', expires: '到期时间', flags: '安全属性', actions: '操作' },
    session: '会话', edit: '编辑', delete: '删除',
    deleteN: (n: number) => `删除 ${n} 条 Cookie？`,
    deleteNote: '将从已保存的登录状态中移除，此操作不可撤销。',
    deleteRunning: '将从已保存的登录状态和本机正在运行的浏览器中移除，此操作不可撤销。',
    deleted: (n: number): News => ({ title: 'Cookie 已删除', detail: `${n} 条` }),
    detail: 'Cookie 详情', close: '关闭详情', value: '值', show: '显示', hide: '隐藏', copy: '复制值', copied: '已复制',
    hidden: 'Cookie 值默认隐藏，以保护敏感信息；每次查看均记入操作日志。', noValue: '当前角色无权查看 Cookie 值。', on: '已启用', off: '未启用',
    none: '暂无 Cookie', noneText: '在环境中登录网站并关闭浏览器后，Cookie 会保存在这里；也可以直接导入。', notSaved: '尚未保存', notSavedText: '浏览器关闭时将自动保存，也可从文件导入。',
    local: '登录状态仅保存在使用该环境的电脑上，Folio 不保留副本，此处无可列出的 Cookie。',
    localRunning: '登录状态仅保存在本机，此时导入的 Cookie 将直接写入正在运行的浏览器。',
    away: '该环境正在其他电脑上使用，关闭后才能修改 Cookie。',
    editTitle: '编辑 Cookie', save: '保存 Cookie', keepValue: '已遮挡，留空则保持原值',
    editNote: '值默认遮挡，查看时记入操作日志；修改结果写入操作日志，但不记录值。',
    sessionOnly: '会话 Cookie', domainErr: '请填写域名。', pathErr: '请填写路径，例如 /。', nameErr: '请填写名称。', expiresErr: '请选择到期时间，或设为会话 Cookie。',
    exportTitle: '导出 Cookie', exportNote: (target: string) => `目标环境：${target}。导出文件包含站点的登录凭据，请妥善保管；本次导出将记入操作日志。`,
    exportMany: (n: number) => `${n} 个环境`, exportScope: '导出范围', scopePicked: (n: number) => `选中的 ${n} 个`, scopeDomain: (site: string) => `${site} 的全部`, scopeAll: '全部 Cookie',
    scopeAllOf: (n: number) => `所选 ${n} 个环境的全部 Cookie`, format: '文件格式', exportSure: '我已确认导出范围及用途', exportDo: '导出文件',
    importTitle: (name: string) => `导入 Cookie（目标环境：${name}）`, modes: { text: '文本导入', file: '文件导入' }, chooseFile: '选择文件…', noFile: '未选择文件',
    formats: '支持 JSON（Cookie-Editor、EditThisCookie、Playwright）与 Netscape cookies.txt 格式，导入前逐条解析并预览。',
    detected: (f: string) => `已识别为 ${f} 格式。`, notJson: '无法解析该 JSON，请检查括号与引号。',
    preview: '解析预览', valid: (n: number) => `${n} 条有效`, invalid: (n: number) => `${n} 条无效`, result: '结果', ok: '有效',
    why: { name: '缺少名称', value: '缺少值', domain: '缺少域名', line: '不是 Cookie 行' },
    willReplace: '将覆盖已有', willSkip: '已存在，跳过',
    conflict: '冲突处理', replace: '覆盖同名 Cookie', skip: '跳过同名 Cookie', conflictHelp: '同名 Cookie 按名称、域名与路径进行识别。',
    submit: (n: number) => `导入 ${n} 条 Cookie`
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
    screen: '屏幕分辨率', screenRandom: '随机（按系统）', screenHost: '跟随本机',
    screenHostHint: 'Chromium 内核的屏幕分辨率跟随本机。', cores: '硬件并发数',
    webrtc: 'WebRTC', webrtcOpts: { udp: '禁用非代理 UDP', replace: '替换为代理 IP', block: '禁用' },
    webgl: 'WebGL', webglOpts: { spoof: '随机显卡', real: '真实显卡' },
    canvas: 'Canvas', canvasOpts: { noise: '噪声', real: '真实', engine: '由内核决定' }
  },
  form: {
    newTitle: '创建环境', editTitle: '编辑环境', name: '环境名称', defaultName: (n: number) => `环境 ${n}`, nameErr: '请填写环境名称。',
    sections: { basic: '基础信息', proxy: '代理配置', fp: '指纹配置', ext: '扩展配置', launch: '启动设置' }, sectionsLabel: '表单分区', hasProblem: '有待修正的项',
    optional: '（选填）',
    group: '所属分组', noGroup: '未分组', newGroup: '新建分组…', newGroupPh: '新分组名称',
    engine: '浏览器内核', os: '操作系统', notDownloaded: (size: string) => `未下载 · ${size}`,
    proxyKind: '代理类型', proxyMode: { saved: '使用已有代理', custom: '自定义代理', none: '不使用代理' }, pickProxy: '选择代理', pickProxyFirst: '请先选择或填写代理。',
    pickErr: '请选择代理，或改为不使用代理。', pastePh: 'socks5://用户名:密码@主机:端口',
    proxyBad: '无法识别该代理地址。',
    proxyOk: (place: string, ms: number) => `连接正常 · ${place} · ${ms} ms`, proxyDown: '连接失败',
    checkedAt: (t: string) => `检测于 ${t}`, lastChecked: (t: string) => `上次检测 ${t}`,
    tags: '标签', tagsPh: '用逗号分隔',
    regenWarn: '网站会将其识别为新设备，已登录的网站可能要求重新验证。', fpErr: '指纹生成失败。',
    firefoxMissing: '需先下载 Firefox 内核才能生成该指纹。', download: '下载', downloading: (pct: number) => `正在下载… ${pct}%`,
    fpEdit: '编辑指纹配置', fpHide: '收起指纹配置', exitUnknown: '出口尚未检测',
    create: '创建环境', save: '保存修改', tz: '时区', lang: '语言', follow: '跟随代理',
    tzPh: '搜索时区，如 Berlin', langPh: 'de-DE', langErr: '请使用 de-DE 格式的语言代码。', searchPh: '搜索…',
    startUrl: '启动页', startUrlHint: '留空时按「恢复上次的标签页」或搜索引擎首页打开。', startUrlErr: '请填写以 http:// 或 https:// 开头的网址。',
    window: '启动窗口尺寸', windowModes: { default: '默认', custom: '自定义', maximized: '最大化' }, width: '宽度', height: '高度',
    windowHint: '此项控制浏览器窗口大小，屏幕分辨率在指纹配置中设置。', windowErr: '宽度须为 400–7680 像素，高度须为 300–4320 像素。',
    notes: '备注', owner: '负责人',
    noExtensions: (engine: string) => `扩展库中暂无 ${engine} 扩展。`, extSearch: '搜索扩展库', extPicked: (n: number) => `已选 ${n} 个`,
    extNone: '没有匹配的扩展。', extAdd: '添加到扩展库', extAddNote: '向扩展库添加扩展需所有者或管理员权限。',
    sync: '登录状态', syncCloud: '保存至 Folio，随环境同步', syncLocal: '仅保存在使用该环境的电脑上',
    syncHelp: '仅存本机时，登录状态不会离开该电脑；在其他电脑上打开时为未登录状态。',
    stale: '编辑期间该环境已被他人修改。再次保存将覆盖对方的修改，取消则保留对方的修改。',
    nextOpen: '修改将在下次启动时生效', runningNote: '内核、系统、代理与指纹须停止环境后修改',
    runningTitle: '环境正在运行', runningBody: '停止环境后才能修改内核、系统、代理和指纹。', stopNow: '停止环境',
    osTitle: '更换操作系统？', osChange: '更换',
    osBody: (os: string) => `更换为 ${os} 后将按新系统重新生成指纹（屏幕、显卡、字体等），网站可能将其识别为新设备。`,
    kindFixed: (other: string) => `已创建的环境不能改用 ${other}，两种内核的数据不通用。`,
    unsaved: '有未保存的修改', changedN: (n: number) => `已修改 ${n} 项`, createHint: '创建后可继续调整环境配置。'
  },
  fpTab: {
    next: '修改将在下次启动环境时生效。', locked: '环境运行中，停止后才能修改指纹配置。',
    browser: '浏览器配置', screen: '屏幕配置', langTz: '语言与时区', hardware: '硬件与媒体',
    current: '当前配置', consistency: '配置一致性', advanced: '高级配置',
    ua: 'User-Agent', uaLater: '由内核按系统与版本生成，运行体检后可在此查看。',
    screenHint: '屏幕分辨率是网页读取的屏幕参数；启动窗口尺寸在编辑环境中设置。',
    defaults: '恢复默认', save: '保存配置', saved: '指纹配置已保存'
  },
  browser: {
    search: '搜索引擎', name: zhSearch,
    restore: '恢复上次的标签页',
    start: '打开时', startTabs: '恢复上次的标签页', startHome: (name: string) => `打开${name}首页`, startBlank: '打开空白页',
    on: '开启', off: '关闭'
  },
  importer: {
    title: '导入环境', lead: '每行一个环境，首行为表头。Excel 表格请先另存为 CSV；每次最多 500 行。',
    columns: '列：name 或 名称（必填）、group 分组、tags 标签（用 | 分隔）、os 系统（windows、macos、linux）、engine 内核（chromium、firefox）、proxy 代理、timezone 时区、language 语言、搜索引擎（google、bing、baidu、duckduckgo、yahoo、yandex 或 none）、恢复标签页（是或否）、notes 备注、cookies（JSON 或 cookies.txt 文本）。',
    example: '填入示例', file: '选择文件…', pasteLabel: 'CSV', ready: (n: number) => `${n} 个环境可导入。`,
    problems: '请先修正以下行：', row: (n: number) => `第 ${n} 行`, header: '首行须包含「name」或「名称」列。',
    errs: { name: '名称为空或太长', os: '无法识别的系统', engine: '无法识别的内核', tags: '最多 10 个标签，每个不超过 24 个字', timezone: '无法识别的时区', language: '不是有效的语言代码', proxy: '代理地址无法识别', cookies: '无法读取 Cookie', search: '无法识别的搜索引擎', restoreTabs: '请填写「是」或「否」', header: '' },
    tooMany: '每次最多 500 行。', room: (free: number) => `套餐剩余 ${free} 个环境额度。`, firefox: '部分行使用 Firefox，请先下载 Firefox 内核。',
    submit: (n: number) => `导入 ${n} 个环境`, steps: { proxies: '正在添加代理…', groups: '正在创建分组…', fingerprints: (i: number, n: number) => `正在生成指纹… ${i} / ${n}`, saving: '正在保存…', cookies: (i: number, n: number) => `正在导入 Cookie… ${i} / ${n}` },
    done: (n: number): News => ({ title: '环境已导入', detail: `${n} 个环境` })
  },
  proxies: {
    title: '代理管理',
    search: '搜索代理', searchPh: '搜索名称、地址或城市', add: '添加代理', import: '导入', checkAll: '全部检测',
    allTab: '全部代理', importTab: '批量导入',
    filterLabels: { keyword: '关键词', type: '协议', region: '地区', status: '状态' },
    filter: { type: '协议', types: '全部协议', region: '地区', regions: '全部地区', state: '状态', states: '全部状态' },
    cols: { name: '代理名称', type: '协议', address: '代理地址', exit: '地区', status: '连接状态', latency: '延迟', profiles: '绑定环境', actions: '操作' },
    labels: { latency: '延迟', uptime: '可用率', profiles: '环境' }, backupOf: (n: string) => `备用 ${n}`, noExit: '出口未知',
    downNote: (n: number, when: string | null) => `连续 ${n} 次连接失败${when ? ` · 最后正常于${when}` : ''}`,
    states: { ok: '连接正常', slow: '较慢', down: '连接失败', unchecked: '未检测', issues: '异常', unbound: '未绑定' },
    history: (n: number) => `最近 ${n} 次检测`, never: '未检测',
    emptyTitle: '暂无代理', empty: '可逐个添加，或导入代理商提供的列表。', addFirst: '添加第一个代理', importList: '导入代理列表',
    bulkCheck: '批量检测', bulkDelete: '删除', confirmDelete: (n: number) => `删除 ${n} 个代理？`, confirmNote: '使用这些代理的环境将保留，并改为不使用代理。',
    bulk: {
      unbind: '解除绑定', unbindNone: '所选代理均未绑定环境。', unbindTitle: (n: number, m: number) => `解除 ${n} 个代理与 ${m} 个环境的绑定？`,
      unbindNote: '这些环境将改为不使用代理，直到重新选择代理；运行中的环境下次启动时生效。',
      unbound: (m: number): News => ({ title: '已解除绑定', detail: `${m} 个环境` })
    },
    deleted: (n: number): News => ({ title: '代理已删除', detail: `${n} 个代理` }), checked: (n: number): News => ({ title: '检测完成', detail: `${n} 个代理` }), actionsX: (n: string) => `${n} 的操作`,
    detail: {
      label: '代理详情', exitIp: '出口 IP', region: '地区', latency: '当前延迟', profiles: '绑定环境', config: '连接配置', history: '最近检测记录',
      ok: (ms: number) => `连接正常 · ${ms} ms`, failed: '连接失败', passSet: '已保存', passNone: '未设置', uptime: '可用率',
      uptimeOf: (pct: number, n: number) => `${pct}%（最近 ${n} 次）`, bound: (n: number) => `绑定环境（${n}）`,
      none: '暂无环境使用此代理。', noHistory: '尚未检测。',
      created: '创建时间', lastChecked: '最后检测', failure: '失败原因', viewAll: '查看全部', manage: '管理', details: '查看详情',
      tabs: { overview: '概览', bound: '绑定环境', checks: '检测记录' },
      createdOn: (when: string) => `创建于 ${when}`, checkedOn: (when: string) => `最近检测 ${when}`, authOn: '已启用', authOff: '未启用',
      runningWarn: '更新连接配置前，请先停止使用该代理的运行中环境。', viewProfile: '查看环境'
    },
    formAdd: '添加代理', formEdit: '编辑代理', save: '保存代理', added: '代理已添加',
    name: '代理名称', namePh: '例如：美国-运营-01', nameErr: '请输入代理名称。', type: '代理协议', host: '代理地址', port: '端口', notes: '备注',
    auth: '身份验证', authHint: '启用后需要填写用户名和密码进行代理认证。',
    user: '用户名', pass: '密码', passKeep: '已保存，留空则不修改。', reveal: '显示', conceal: '隐藏',
    lastTest: (when: string) => `最近检测：${when}`, justNow: '刚刚', typedTest: '按当前填写的信息检测，尚未保存',
    test: '检测连接', testOk: '连接正常', testBad: '连接失败',
    why: {
      proxy_unreachable: '无法连接代理服务器', proxy_timeout: '连接代理服务器超时', proxy_auth: '用户名或密码被拒绝', proxy_protocol: '代理未按所选协议应答',
      target_refused: '代理无法访问检测地址', target_timeout: '代理访问检测地址超时', tls: '加密连接失败', no_ip: '未取得出口 IP'
    } as Record<string, string>,
    whyHttp: (status: string) => `检测地址返回 HTTP ${status}`,
    fix: {
      proxy_unreachable: '请检查代理地址与端口。', proxy_timeout: '代理可能已失效，或本机网络无法访问该地址。', proxy_auth: '请核对用户名与密码；若在其他电脑上可用，请在服务商后台将本机的公网 IP 加入白名单，并确认账号未到期。',
      proxy_protocol: '请确认协议类型（SOCKS5 或 HTTP），以及代理是否只允许白名单 IP 使用。', target_refused: '代理已连接，但拒绝或无法访问公共检测地址。',
      target_timeout: '代理已连接，但响应过慢。', tls: '经代理与检测地址建立加密连接失败。', no_ip: '检测地址未返回出口 IP，请稍后重试。'
    } as Record<string, string>,
    recheck: '连接信息已更改，请重新检测。',
    bound: (n: number, running: number) => `已绑定 ${n} 个环境，其中 ${running} 个正在运行。`,
    boundHere: '修改连接信息需先停止本机运行中的相关环境。',
    boundThere: (n: number) => `另有 ${n} 个在其他电脑上运行，将在下次启动时使用新的连接信息。`,
    stopSave: '停止相关环境后保存',
    launchWhy: (why: string) => `代理检测未通过（${why}），且没有可用的备用线路。`,
    addMore: '保存后继续添加',
    backup: '备用线路', backupNone: '无', backupHint: '该线路无响应时自动切换至备用线路。',
    hostErr: '请填写主机名或 IP 地址。', portErr: '端口范围是 1 到 65535。',
    imp: {
      title: '批量导入代理', modes: { text: '文本导入', file: '文件导入' },
      protocol: '代理协议', protocolHint: '未注明协议的行按此处理。', naming: '默认命名', namePh: '代理-{n}', sep: '、',
      nameHint: (ex: string) => `将按序号自动命名，如：${ex}…`, list: '代理列表', listHint: '每行一条代理，支持填写身份验证信息',
      formats: '格式：地址:端口:用户名:密码 · 用户名:密码@地址:端口 · socks5://用户名:密码@地址:端口 · 地址:端口',
      chooseFile: '选择文件…', noFile: '未选择文件',
      notesTitle: '导入说明', notes: ['端口范围为 1 – 65535', '重复代理可在预览中确认', '导入后建议检测连接'],
      preview: '解析预览', counts: (n: number) => `共 ${n} 条`, valid: (n: number) => `有效 ${n} 条`, invalid: (n: number) => `无效 ${n} 条`,
      cols: { line: '行号', address: '代理地址', port: '端口', result: '验证结果' },
      ok: '格式有效', saved: '已保存，将复用', repeat: '与上方的行重复', again: '将重复添加',
      why: { format: '格式错误', port: '端口格式错误' },
      invalidNote: '无效记录不会导入，请修正后重新解析。',
      skip: '跳过重复代理', skipHelp: '与已保存代理或上方行完全相同的行，直接使用已有代理，不再重复添加。',
      reparse: '重新解析', submit: (n: number) => `导入 ${n} 条代理`,
      done: (added: number, reused: number): News => ({ title: '代理已导入', detail: `新增 ${added} 个${reused ? `，复用 ${reused} 个` : ''}` })
    },
    replace: {
      title: '更换代理', lead: (name: string) => `为环境 ${name} 更换代理，请选择新的代理。`, current: '当前代理', state: '当前状态',
      pick: '选择', test: '检测所选代理', confirm: '确认更换',
      running: '环境运行中，停止后才能更换代理。', stop: '停止环境', warn: '更换代理后，请检查语言与时区配置。',
      done: (profile: string, proxy: string): News => ({ title: '代理已更换', detail: `${profile} 已更换为 ${proxy}` })
    }
  },
  trash: {
    title: '回收站', empty: '回收站为空', emptyText: (n: number) => `删除的环境会在此保留 ${n} 天，期间可以恢复。`,
    restore: '恢复', restoreAll: '全部恢复', purge: '彻底删除', purgeAll: '清空回收站',
    cols: { profile: '环境名称', number: '环境 ID', group: '原分组', fingerprint: '指纹', signins: '登录状态', deleted: '删除时间', by: '删除人', left: '剩余保留天数' },
    filterLabels: { keyword: '关键词', by: '删除人', when: '删除时间' },
    search: '搜索环境名称或 ID', when: '删除时间', anyone: '全部删除人', days: (n: number) => `${n} 天`,
    picked: (n: number) => `已选择 ${n} 条记录`, restoreTo: '恢复目标分组', restoreToHint: '未选择时，各环境恢复到原分组。', sameGroup: '原分组',
    restoreN: (n: number) => `恢复（${n} 项）`, purgeN: (n: number) => `彻底删除（${n} 项）`,
    typeName: (name: string) => `输入环境名称「${name}」以确认`, typeCount: (n: number) => `输入 ${n} 以确认`,
    sites: (n: number) => (n ? `${n} 个站点` : '无'), byAt: (who: string, when: string) => `${who} 删除于 ${when}`,
    confirmPurge: (n: number) => `彻底删除 ${n} 个环境？`, confirmNote: '此操作无法撤销，其指纹与设置将无法恢复。',
    restored: (n: number): News => ({ title: '环境已恢复', detail: `${n} 个环境` }), purged: (n: number): News => ({ title: '已彻底删除', detail: `${n} 个环境` })
  },
  engines: {
    title: '内核管理',
    check: '检查更新', upToDate: '所有内核均为最新版本', upToDateText: '已安装的内核均为最新版本，无需更新。', updates: (n: number) => `发现 ${n} 个可更新版本`,
    defaultKernel: '默认内核', defaultOf: (engine: string) => `${engine} · 推荐版本`, defaultSet: (v: string): News => ({ title: '默认内核已设置', detail: `新建环境将默认使用 ${v}` }),
    tabs: { all: '全部内核', installed: '已安装', updates: '可更新' },
    search: '搜索内核版本', searchPh: '搜索内核版本…', system: '平台', systems: '全部平台', filterLabels: { keyword: '关键词', system: '平台' },
    families: { win: 'Windows', mac: 'macOS', linux: 'Linux' },
    cols: { version: '内核版本', number: '版本号', platforms: '支持平台', size: '大小', released: '发布日期', profiles: '使用环境', status: '状态', actions: '操作' },
    recommended: '推荐', default: '默认', installed: '已安装', notDownloaded: '未安装', download: '下载', failed: '下载失败',
    downloadingPct: (pct: number) => `下载中 ${pct}%`, everywhere: (n: number) => `全平台 ${n} 个`, actionsX: (v: string) => `${v} 的操作`,
    setDefault: '设为默认', details: '查看详情',
    remove: '移除', removeBusy: '无法移除：有环境正在使用', removed: (v: string): News => ({ title: '已从本机移除', detail: v }),
    retired: '已从目录下架', none: '该内核暂无适用于本机系统的版本。',
    noneDownloaded: '本机尚未下载内核', noneDownloadedText: '可在「全部内核」中下载；启动环境时也会自动下载所需版本。',
    outdated: (n: number, kernel: string) => `${n} 个环境使用旧版本 ${kernel}`, upgrade: (v: string) => `升级到 ${v}`,
    upgradeNote: (v: string) => `升级到推荐的 ${v} 后，网站看到的指纹保持不变。`,
    upgradeSkip: (n: number) => `其中 ${n} 个正在运行，将保持不变，停止后再升级。`,
    paused: (pct: number) => `已暂停 · ${pct}%`, pause: '暂停', resume: '继续',
    disk: (size: string) => `本机内核共占用 ${size}`, cleanup: '清理未使用的版本', nothingToClean: '已下载的版本均在使用中或为推荐版本。',
    cleanupTitle: (n: number) => `清理 ${n} 个未使用的版本？`, cleanupNote: (size: string) => `可释放 ${size}，环境需要时将重新下载。`,
    cleaned: (n: number): News => ({ title: '已清理未使用的版本', detail: `${n} 个版本` }),
    settings: '下载设置', autoDownload: '自动下载更新', autoHint: '已有环境保持当前内核版本',
    autoHelp: '新的推荐版本将在后台下载到本机；已有环境继续使用原版本，需要时可一键升级。',
    idleOnly: '只在空闲时下载',
    upgraded: (n: number, v: string): News => ({ title: '内核已升级', detail: `${n} 个环境 · ${v}` }),
    platforms: { 'win32-x64': 'Windows', 'darwin-arm64': 'macOS · Apple 芯片', 'darwin-x64': 'macOS · Intel', 'linux-x64': 'Linux' } as Record<string, string>,
    notes: {
      title: '版本说明', version: '版本号', released: '发布日期', size: '大小', profiles: '使用环境', changes: '更新内容', none: '暂无更新说明。',
      systems: '支持平台', switchWarn: '切换内核需先停止相关环境', switchWhy: '以确保数据正常保存和环境安全。'
    },
    admin: {
      upload: '上传新版本', title: '上传内核版本', kind: '内核', version: '版本号', versionPh: '如 151.0.7900.10', platform: '系统',
      file: '安装包', choose: '选择文件…', fileHint: '内核发布的原始安装包：.zip、.tar.xz 或 .dmg，直接上传至 Folio 存储。',
      hashing: (pct: number) => `正在校验文件… ${pct}%`, uploading: (pct: number) => `正在上传… ${pct}%`, send: '上传', done: (v: string): News => ({ title: '已加入内核目录', detail: v }),
      recommend: '设为推荐', recommended: (v: string): News => ({ title: '已设为推荐版本', detail: v }), retire: '下架', unfinished: '上传未完成',
      recommendTitle: (v: string) => `将 ${v} 设为推荐版本？`, recommendNote: '未设置默认内核的工作空间，新建环境将使用该版本；下方说明显示在版本说明中。', note: '更新说明（可选）',
      retireTitle: (v: string) => `下架 ${v}？`,
      retireConfirm: (n: number) => `${n ? `全平台 ${n} 个环境在用。` : ''}已下载的电脑可继续使用，其他电脑上的相关环境需改用其他版本。`,
      retiredDone: (v: string): News => ({ title: '版本已下架', detail: v })
    }
  },
  team: {
    title: '团队成员',
    invite: '邀请成员', me: (name: string) => `${name}（我）`, remove: '移出团队', leave: '退出团队',
    tabs: { members: '成员', invites: '待接受邀请', roles: '角色权限' },
    cols: { person: '成员 / 邮箱', role: '角色', scope: '授权范围', status: '状态', active: '最后活跃时间', actions: '操作', invitedBy: '邀请人', expires: '有效期至' },
    seatsOf: (used: number, limit: number | null) => (limit === null ? `已用 ${used} 个席位，不限席位` : `席位 ${used} / ${limit}`),
    protectedTag: '受保护', access: '权限', removeShort: '移除',
    filterLabels: { keyword: '关键词', role: '角色' },
    scopeAll: '全部环境', scopeOwn: '自己的环境', joined: '已加入',
    seats: '成员席位', seatsFree: (n: number) => `已用 ${n} 个 · 不限席位`, allRoles: '全部角色', noInvites: '暂无待接受的邀请', noInvitesText: '邀请在被接受或过期之前会显示在这里。',
    defsTitle: '角色定义', editAccess: '编辑权限', accessTitle: (e: string) => `编辑权限：${e}`,
    accessSub: '角色在整个工作空间内生效，分组决定成员可访问的环境范围。', saved: '权限已保存',
    viaParent: '随上级分组', noGroups: '尚未建立分组。',
    search: '搜索成员', meTag: '（我）', moreX: (e: string) => `${e} 的更多操作`,
    copiedNew: { title: '已复制新的邀请链接', detail: '原链接已失效' },
    roleHelp: {
      owner: '拥有工作空间的全部权限，可管理成员、分组、全部环境与设置，且不可更改。',
      admin: '可查看和管理全部环境、代理与成员，但不能更改所有者。',
      member: '可查看和打开自己的环境及所在分组的环境；可新建和编辑，不可删除。',
      viewer: '可查看自己的环境及所在分组的环境，不能做任何修改。'
    } as Record<string, string>,
    roleActions: (n: number) => `${n} 项权限`,
    copyLink: '复制链接', copied: '邀请链接已复制', resend: '重新发送', withdraw: '撤回', withdrawn: '邀请已撤回',
    inviteTitle: '邀请成员', email: '邮箱', emailErr: '请填写邮箱地址。', role: '成员角色',
    emails: '邀请邮箱', emailsPh: 'name@company.com', emailsHint: '每次最多邀请 10 位成员，每个邮箱后按回车或输入逗号。',
    emailBad: (e: string) => `${e} 不是有效的邮箱地址。`, tooMany: '每次最多邀请 10 位成员。', removeEmail: (e: string) => `移除 ${e}`,
    summaryTitle: '权限摘要', summaryAll: '该角色可访问工作空间内的全部环境。',
    summaryGroups: (n: number) => `可访问自己的环境及所选的 ${n} 个分组，操作范围由角色决定。`,
    summaryOwn: '仅可访问分配给自己的环境，操作范围由角色决定。',
    validity: '邀请有效期', days: (n: number) => `${n} 天`,
    seatsAfter: (n: number, max: number) => `邀请后预计占用 ${n} / ${max} 席位`,
    send: '发送邀请', sent: (e: string): News => ({ title: '邀请已发送', detail: e }), notSent: { title: '邀请邮件发送失败', detail: '请复制链接发送给对方' },
    sentShort: '邀请已发送', notSentShort: '邮件未发出，请复制链接发送给对方',
    done: '完成',
    removeTitle: (e: string) => `移除 ${e}`, removeLead: '其名下环境将转交给指定人员；其电脑上已打开的环境将被关闭，本地数据将被删除。',
    heir: '环境转交给', heirNeeded: '请先选择接收其环境的成员。', removeDo: '移出团队', removed: (e: string): News => ({ title: '成员已移出', detail: e }),
    leaveTitle: (ws: string) => `退出「${ws}」？`, leaveLead: '您在此团队的环境将转交给所有者，此后将无法访问该团队。', leaveDo: '退出',
    removedYou: (ws: string): News => ({ title: `您已不在「${ws}」中`, detail: '其环境已在本机关闭并删除' }),
    groupAccess: '分组授权',
    invites: '收到的邀请', join: '加入', decline: '拒绝', from: (who: string, role: string) => `${who} 邀请您成为${role}`
  },
  jobs: {
    title: '任务中心',
    live: '自动刷新', kind: '任务类型', range: '时间范围',
    tabs: { all: '全部任务', running: '进行中', done: '已完成', partial: '部分失败', canceled: '已取消' },
    kinds: { all: '全部类型', 'proxy.check': '批量检测代理', 'profile.open': '批量启动环境', 'proxy.import': '导入代理', 'profile.edit': '批量更新环境', 'kernel.download': '内核下载' },
    ranges: { day: '最近 24 小时', week: '最近 7 天', month: '最近 30 天', all: '全部时间' },
    cols: { name: '任务名称', by: '发起人', progress: '进度', status: '状态', created: '创建时间', actions: '操作', target: '对象', result: '结果', reason: '失败原因', at: '完成时间' },
    states: { running: '进行中', done: '已完成', partial: '部分失败', failed: '失败', canceled: '已取消' },
    results: { pending: '等待中', ok: '成功', failed: '失败', canceled: '已取消' },
    me: '我', view: '查看', empty: '该时间段内暂无任务', emptyText: '批量检测代理、批量启动环境等操作的进度与结果会显示在这里。', by: (who: string) => `发起人：${who}`,
    total: '总数', ok: '成功', failed: '失败', canceled: '已取消', resultsTab: '执行结果', logTab: '任务日志',
    started: (n: number) => `开始执行，共 ${n} 项`, finished: (s: string) => `执行结束：${s}`,
    retry: (n: number) => `重试失败项（${n}）`, retryNote: '仅重试失败项，已成功项保持当前结果。',
    retryElsewhere: '该任务在其他电脑上执行，请在那台电脑上重试。', retryTheirs: '仅任务发起人可重试。',
    cancel: '取消任务', download: '下载结果', saved: (p: string): News => ({ title: '结果已保存', detail: p }),
    errors: { running: '环境正在运行', gone: '环境已删除', paused: '下载已暂停', failed: '执行失败', canceled: '已取消' } as Record<string, string>
  },
  states: {
    noProfiles: '尚未创建环境', noProfilesText: '当前工作空间中还没有任何环境。创建环境后，即可进行浏览器指纹配置、代理设置等操作。', create: '创建环境',
    noMatch: '未找到匹配结果', noMatchText: '没有与当前筛选条件匹配的内容，请调整关键词或清除筛选。', clear: '清除筛选',
    proxyDown: '代理连接失败', proxyDownText: (addr: string) => `无法连接到代理服务器 ${addr}。请检查代理信息或网络状态后重新检测。`,
    checkAgain: '重新检测', editProxy: '编辑代理',
    launchFailed: '环境启动失败', launchFailedText: (n: string) => `环境 ${n} 启动失败。请检查代理、网络或内核配置后重试。`,
    why: '查看原因', retry: '重试',
    noAccess: '暂无访问权限',
    noAccessText: (admin: string | null) => `当前角色没有访问此内容的权限，请联系所有者${admin ? `（${admin}）` : ''}申请访问权限。`,
    contact: '联系所有者', askSubject: 'Folio 访问权限申请',
    offline: '网络连接中断', offlineText: '与服务器的网络连接已中断，请检查网络状态后重新连接。', reconnect: '重新连接',
    loadFailedText: '加载时出现问题，请重新加载。',
    partial: (what: string) => `部分数据加载失败（${what}），列表信息可能不完整。`,
    lists: { profiles: '环境', trash: '回收站', groups: '分组', proxies: '代理', members: '成员', flows: '流程', tasks: '定时任务', extensions: '扩展', jobs: '任务' } as Record<string, string>, listSep: '、',
    underway: (what: string) => `${what}进行中`, resultsThere: '完成后将在任务中心显示结果。', viewTask: '查看任务',
    partly: (what: string, ok: number, failed: number): News => ({ title: `${what}部分失败`, detail: `成功 ${ok}，失败 ${failed}` }), view: '查看详情'
  },
  rolesPage: {
    list: '角色列表', add: '新建角色', note: '角色决定操作能力，分组授权决定资源范围。',
    descs: { owner: '系统内置角色，拥有所有权限', admin: '管理团队与所有资源', member: '使用已授权分组内的环境', viewer: '仅可查看，无编辑权限' } as Record<string, string>,
    customOf: (n: number) => `自定义角色 · ${n} 项权限`, customHint: '本工作空间自定义的角色。',
    people: (n: number) => `${n} 人`, ownerNote: '所有者角色始终拥有全部权限。',
    sections: { profiles: '环境管理', data: '数据操作', proxies: '代理', team: '团队' },
    perms: {
      'profiles.view': ['查看环境', '可查看环境列表与详情'], 'profiles.create': ['创建环境', '可新建环境'],
      'profiles.edit': ['编辑环境', '可修改环境的配置信息'], 'profiles.open': ['启动环境', '可启动和停止环境'],
      'profiles.delete': ['删除环境', '可将环境移至回收站并删除'],
      'cookies.import': ['导入 Cookie', '可向环境导入 Cookie'], 'cookies.export': ['导出 Cookie', '可导出环境 Cookie 并查看其值'],
      'profiles.export': ['导出环境', '可导出环境数据（如配置、Cookie 等）'],
      'proxies.view': ['查看代理', '可查看代理列表与详情'], 'proxies.bind': ['绑定代理', '可为环境绑定或解除代理'],
      'proxies.edit': ['编辑代理', '可添加、修改与删除代理'],
      'team.manage': ['管理成员', '可邀请、编辑或移除成员，并管理角色、分组、工作空间设置与订阅'],
      'activity.view': ['查看日志', '可查看团队操作日志']
    } as Record<string, [string, string]>,
    reset: '恢复默认', save: '保存权限', saved: (r: string): News => ({ title: '权限已保存', detail: r }),
    delete: '删除角色', deleteTitle: (r: string) => `删除角色「${r}」？`, deleteNote: '仅可删除没有成员使用、也没有待接受邀请的角色。', deleted: (r: string): News => ({ title: '角色已删除', detail: r }),
    newTitle: '新建角色', name: '角色名称', nameErr: '请填写角色名称。', from: '初始权限', fromNone: '不含任何权限', create: '创建角色'
  },
  activity: {
    title: '操作日志', person: '操作人', everyone: '全部成员', kind: '操作类型',
    search: '搜索对象名称、操作人或操作编号', cols: { time: '时间', person: '操作人', type: '操作类型', object: '操作对象', what: '操作内容', view: '详情' },
    filterLabels: { keyword: '关键词', person: '操作人', kind: '操作类型', dates: '时间范围' }, view: '查看',
    kinds: { all: '全部操作', open: '打开与关闭', profiles: '环境改动', trash: '回收站', proxies: '代理与分组', cookies: 'Cookie 与导出', team: '团队', extensions: '扩展', automation: '自动化' },
    dates: '时间范围', from: '开始日期', until: '结束日期', to: '至',
    partial: '当前角色仅显示您本人的操作，以及您可访问的环境的操作记录。',
    export: '导出日志', exported: (path: string): News => ({ title: '日志已导出', detail: path }), empty: '暂无记录', emptyText: '工作空间内对环境、代理、成员与设置的操作会记录在这里。', someone: '有人', recent: '最近操作', by: (who: string) => `由 ${who} 操作`,
    today: '今天', yesterday: '昨天',
    detail: {
      title: '操作详情', number: '操作编号', person: '操作人', time: '时间', type: '操作类型', object: '操作对象', device: '来源电脑', what: '操作内容',
      fields: '修改的项目', change: '名称变更', note: '日志不记录密码与 Cookie 明文。',
      changes: { field: '字段', from: '修改前', to: '修改后' }, secret: '已修改（不记录明文）', changed: '已修改', empty: '空', on: '开启', off: '关闭'
    },
    types: {
      'profile.create': '新建环境', 'profile.update': '编辑环境', 'profile.move': '移动分组', 'profile.tag': '添加标签', 'profile.untag': '移除标签',
      'profile.set-proxy': '更换代理', 'profile.assign': '分配环境', 'profile.trash': '删除环境', 'profile.restore': '恢复环境', 'profile.purge': '彻底删除',
      'profile.open': '启动环境', 'profile.close': '关闭环境', 'profile.takeover': '接管环境',
      'proxy.create': '添加代理', 'proxy.import': '导入代理', 'proxy.update': '编辑代理', 'proxy.delete': '删除代理',
      'group.create': '新建分组', 'group.rename': '重命名分组', 'group.delete': '删除分组', 'group.members': '分组授权',
      'member.invite': '邀请成员', 'member.join': '加入团队', 'member.role': '变更角色', 'member.groups': '调整授权分组', 'member.remove': '移除成员', 'member.leave': '退出团队',
      'invitation.withdraw': '撤回邀请', 'role.create': '新建角色', 'role.update': '修改角色', 'role.delete': '删除角色',
      'cookies.export': '导出 Cookie', 'cookies.import': '导入 Cookie', 'cookies.edit': '编辑 Cookie', 'cookies.delete': '删除 Cookie', 'workspace.export': '导出工作空间', 'workspace.import': '导入工作空间',
      'flow.create': '新建流程', 'flow.update': '编辑流程', 'flow.delete': '删除流程', 'task.create': '新建定时任务', 'task.update': '编辑定时任务', 'task.delete': '删除定时任务',
      'run.start': '开始运行', 'run.finish': '运行结束', 'extension.add': '添加扩展', 'extension.update': '更新扩展', 'extension.delete': '删除扩展',
      'profile.add-extension': '安装扩展', 'profile.remove-extension': '卸载扩展', 'profile.set-kernel': '变更内核', 'profile.set-browser': '浏览器设置'
    } as Record<string, string>,
    actions: {
      'profile.create': p => `创建了 ${p}`, 'profile.update': (p, x) => `修改了 ${p} 的${uniq((x.fields ?? []).map((f: string) => zhFields[f] ?? f)).join('、')}`,
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
      'member.role': (_p, x) => `将 ${x.email} 设为${x.role}`, 'member.groups': (_p, x) => `调整了 ${x.email} 的授权分组`, 'member.remove': (_p, x) => `移除了 ${x.email}，其环境已转交 ${x.to}`,
      'member.leave': () => '退出了团队', 'invitation.withdraw': (_p, x) => `撤回了给 ${x.email} 的邀请`,
      'role.create': (_p, x) => `新建了角色「${x.name}」`, 'role.update': (_p, x) => `调整了角色「${x.name}」的权限`, 'role.delete': (_p, x) => `删除了角色「${x.name}」`,
      'cookies.delete': (p, x) => `删除了 ${p} 的 ${x.count} 个 Cookie`,
      'cookies.export': (p, x) => `导出了 ${p} 的 ${x.count} 个 Cookie`, 'cookies.import': (p, x) => `向 ${p} 导入了 ${x.count} 个 Cookie`,
      'cookies.edit': (p, x) => `编辑了 ${p} 的 Cookie ${x.name}（${x.domain}）`,
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
    passShort: '口令至少 10 位。', passMismatch: '两次输入的口令不一致。', export: '导出', exported: (path: string): News => ({ title: '环境已导出', detail: path }),
    importTitle: '导入数据', importLead: '将 .folio 文件导入当前团队：环境将新增并重新编号，相同的代理与同名分组将复用。',
    choose: '选择 .folio 文件…', unlock: '解锁',
    preview: (p: { workspace: string; profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }) => `来自「${p.workspace}」：${p.profiles} 个环境（${p.signedIn} 个含登录状态）、${p.proxies} 个代理、${p.groups} 个分组${p.extensions ? `、${p.extensions} 个扩展` : ''}。`,
    room: (free: number) => `套餐剩余 ${free} 个环境额度。`, import: '导入',
    imported: (r: { profiles: number; proxies: number; groups: number; extensions: number; signedIn: number }) : News => ({ title: '环境已导入', detail: `${r.profiles} 个环境（${r.signedIn} 个含登录状态），新增 ${r.proxies} 个代理、${r.groups} 个分组${r.extensions ? `、${r.extensions} 个扩展` : ''}` })
  },
  flows: {
    title: '流程', new: '新建流程',
    template: '登录检查模板', templateName: '登录检查',
    cols: { name: '流程', steps: '步骤', by: '创建人', updated: '修改时间' }, search: '搜索流程名称',
    emptyTitle: '暂无流程', empty: '流程由一系列步骤组成（打开网页、点击、输入、提取等），可在一个或多个环境中运行。',
    you: '我', view: '查看', duplicate: '复制', duplicateToEdit: '复制后修改', delete: '删除', deleteX: (n: string) => `删除 ${n}`,
    inUse: (tasks: string) => `正被 ${tasks} 使用，无法删除。`, confirmDelete: (n: string) => `删除「${n}」？`, deleted: (n: string): News => ({ title: '流程已删除', detail: n }), copyName: (n: string) => `${n}（副本）`, untitled: '新流程',
    back: '流程', backLabel: '返回流程列表', name: '流程名称', nameNeeded: '请填写流程名称。', save: '保存', saving: '正在保存…', saved: '流程已保存',
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
    title: '定时任务', new: '新建任务', needFlow: '请先在「流程」页创建流程。', search: '搜索任务名称',
    emptyTitle: '暂无任务', empty: '任务将流程分批运行在一组环境上，并保留每次运行的结果。',
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
    confirmDelete: (n: string) => `删除「${n}」及其运行记录？`, deleted: (n: string): News => ({ title: '任务已删除', detail: n }), started: (n: string): News => ({ title: '已在本机开始运行', detail: n }),
    saved: '任务已保存', stale: '编辑期间该任务已被他人修改，请重新打开后再编辑。',
    status: { running: '运行中', done: '已完成', stopped: '已停止', interrupted: '已中断', missed: '错过', busy: '跳过' },
    progress: (done: number, all: number) => `已完成 ${done} / ${all}`, elsewhere: (where: string) => `在 ${where} 上`,
    counts: (c: { ok: number; failed: number; signed_out: number; skipped: number; canceled: number }) => [c.ok && `${c.ok} 个成功`, c.signed_out && `${c.signed_out} 个掉线`, c.failed && `${c.failed} 个失败`, c.skipped && `${c.skipped} 个跳过`, c.canceled && `${c.canceled} 个未运行`].filter(Boolean).join(' · ') || '均未运行',
    back: '任务', backLabel: '返回任务列表', about: (flow: string, n: number, conc: number, retries: number) => `${flow} · ${n} 个环境 · 同时 ${conc} 个 · ${retries === 0 ? '不重试' : `失败重试 ${retries} 次`}`,
    runs: '运行记录', noRuns: '暂无运行记录。', triggers: { manual: '手动', rerun: '重新运行', schedule: '定时' }, result: '运行结果',
    missedNote: (at: string, device: string) => `${at} 未运行：${device || '所属电脑'}上的 Folio 未运行或未登录，或电脑处于睡眠状态。`,
    busyNote: (at: string) => `${at} 未运行：上一轮尚未完成。`, runNow: '补运行',
    startedBy: (who: string, device: string | null, when: string) => `${who}${device ? `，在 ${device} 上` : ''}，${when}`,
    rerun: (n: number) => `重新运行未成功的 ${n} 个环境`, export: '导出 CSV', exported: (path: string): News => ({ title: '运行记录已导出', detail: path }),
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
    server: '本机 API', serverLead: '本机脚本通过该地址调用 Folio。', enable: '开启', listening: '正在监听', off: '已关闭。开启后本机脚本方可调用。', copy: '复制', copied: '已复制',
    status: '状态', running: '运行中', stopped: '已关闭', failed: '未运行', rate: '调用频率',
    errors: { port_in_use: '该端口已被其他程序占用，请更换端口。', listen_failed: '该端口启动失败，请更换端口。' },
    port: '端口', limit: '每分钟最多 60 次请求（含打开、关闭与查询），脚本直接发送给浏览器的指令不计入；公司版不限速。',
    unthrottled: '公司版：请求不限速。',
    security: '调试地址没有密码保护：通过 API 打开的环境运行期间，本机任何程序均可控制该环境。手动打开的环境不开启调试地址。',
    tokens: '令牌', tokensLead: '脚本凭令牌调用 API；令牌作废后，使用该令牌的脚本将无法继续调用。',
    noTokens: '暂无令牌', noTokensText: '请为每个调用 API 的脚本或服务分别生成令牌。',
    newToken: '请立即复制该令牌，关闭后将不再显示。', done: '完成', tokenName: '例如：订单同步', createToken: '生成令牌', defaultName: '令牌',
    nameLabel: '令牌名称', nameHint: '建议以使用该令牌的脚本命名，便于日后作废。',
    unused: '尚未使用', revoke: '作废', revokeX: (n: string) => `作废 ${n}`, otherWorkspace: '其他工作空间',
    cols: { name: '名称', workspace: '工作空间', created: '生成时间', used: '最后使用', actions: '操作', time: '时间', method: '方法', path: '路径', status: '状态码', token: '令牌' },
    examples: '示例', exampleNames: { playwright: 'Playwright', puppeteer: 'Puppeteer', selenium: 'Selenium', firefox: 'Firefox 环境' },
    copyAddress: '复制地址', limited: '超出限额',
    placeholder: '请将 <token> 替换为您的令牌；令牌仅在生成时显示一次。',
    calls: '最近调用', callsLead: '脚本的最近调用记录，实时更新。', noCalls: '暂无脚本调用，调用发生时将在此实时显示。', noToken: '令牌无效',
    offTitle: '本机 API 未开启', noCallsTitle: '暂无调用记录'
  },
  extensions: {
    title: '扩展管理', add: '添加扩展',
    memberNote: '扩展库由所有者和管理员维护。成员可在环境编辑或批量操作中，为自己的环境安装库中的扩展。',
    emptyTitle: '暂无扩展', empty: '可从文件或商店添加，再安装到环境中。',
    cols: { name: '扩展', engine: '内核', version: '版本', signature: '签名', profiles: '环境', updated: '修改时间' },
    search: '搜索扩展', inProfiles: (n: number) => `${n} 个环境`,
    install: '安装到环境…', installTitle: (n: string) => `将 ${n} 安装到环境`, installMany: (n: number) => `将 ${n} 个扩展安装到环境`,
    installDo: (n: number) => (n ? `安装到 ${n} 个环境` : '安装'), installedHere: '已安装', noProfiles: '暂无该内核的环境。',
    deleteNote: '相关环境可继续使用，之后可重新添加。',
    uploaded: '上传的文件', update: '新版本', delete: '删除', deleteX: (n: string) => `删除 ${n}`,
    signed: '签名已校验', signedNote: '安装到环境前，Folio 都会核对安装包的签名与校验值，任一不符即不予安装。',
    confirmDelete: (n: string, count: number) => (count ? `删除「${n}」？将从 ${count} 个环境中卸载。` : `删除「${n}」？`),
    deleted: (n: string): News => ({ title: '扩展已删除', detail: n }), added: (n: string): News => ({ title: '已加入扩展库', detail: n }), updated: (n: string): News => ({ title: '扩展已更新', detail: `${n} · 环境下次打开时启用新版本` }),
    addTitle: '添加扩展', updateTitle: (n: string) => `${n} 的新版本`, from: '来源', fromLink: '扩展地址', fromFile: '本机文件',
    chooseFile: '选择文件…', fileHintChromium: '.crx 或 .zip，顶层须包含 manifest.json。', fileHintFirefox: '.xpi 或 .zip，顶层须包含 manifest.json。',
    storeChromium: '商店链接、扩展 ID 或下载地址', storeFirefox: '附加组件链接、短名称或下载地址',
    linkHintChromium: '下载地址须以 .crx 或 .zip 结尾。', linkHintFirefox: '下载地址须以 .xpi 或 .zip 结尾。',
    idNote: 'Folio 为扩展配置独立密钥，使其在各台电脑上的 ID 一致，扩展数据可随环境同步。因此其 ID 与商店版本不同，少数需与本机程序或网站配对的扩展可能依赖原 ID。',
    uuidNote: '每个环境为该附加组件分配不同的内部地址，网站无法借此关联不同环境。',
    addDo: '添加', updateDo: '上传', uploading: '正在上传…', fetching: '正在下载…',
    failedCheck: (profile: string, names: string[]): News => ({ title: '扩展未通过完整性校验', detail: `${profile} 已打开，${names.join('、')} 未安装` })
  },
  windowSync: {
    title: '窗口同步', on: '窗口同步已开启。', onBadge: '开启',
    summary: (leader: string, n: number) => `${leader} 主控，${n} 个窗口跟随。`,
    leaderTag: '主控', followerTag: '同步', makeLeader: '设为主控', stop: '停止同步', current: '同步中',
    address: '所有窗口一起打开的网址', addressPh: '在所有窗口中打开网址', open: '打开',
    pick: '选择窗口',
    running: '已打开', start: (n: number) => (n < 2 ? '至少选择两个' : `同步 ${n} 个窗口`),
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
    upsell: {
      title: '一次操作，同步多个窗口', lead: '将主控窗口的点击、输入与页面操作，同步至其他窗口。',
      features: [['同步操作', '点击、输入、按键与滚动'], ['同步页面', '地址与标签页同步更新'], ['窗口平铺', '一键排列，便于统一查看']] as [string, string][],
      unlock: '升级解锁', guide: '查看使用说明', now: (plan: string) => `当前套餐：${plan} · 升级后可使用窗口同步`,
      ask: '请联系所有者或管理员升级', art: { leader: '主控窗口', follower: '同步窗口', action: '同步操作' }
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
    title: '命令面板', placeholder: '搜索环境、代理、成员、页面或操作', groups: { profiles: '环境', proxies: '代理', members: '成员', actions: '操作', pages: '页面' },
    none: '没有匹配的结果。', move: '选择', run: '执行', close: '关闭', open: '打开', switchTo: '切换到窗口', stop: (n: string) => `停止 ${n}`,
    newProfile: '创建环境', importProfiles: '导入环境', checkProxies: '检测全部代理', addProxy: '添加代理',
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
  errors: {
    invalid_credentials: '邮箱或密码错误。',
    wrong_password: '当前密码不正确。',
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
    store_ref: '无法识别该地址，请填写商店链接、扩展 ID 或下载地址。',
    store_failed: '无法下载该扩展。请检查地址，或下载后选择本机文件。',
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
// How long a profile has been running: 1:42:10, and past a day, its days and hours.
export function runTime(d: Dict, ms: number){
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 86400) return d.common.runDays(Math.floor(s / 86400), Math.floor((s % 86400) / 3600));
  return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}
export const errorText = (d: Dict, code: string) => d.errors[code] ?? d.errors.internal;
// Why a proxy check failed, in words; null for a code that isn't one of the check's own.
export const checkWhy = (d: Dict, code: string | null) => (!code ? null : d.proxies.why[code] ?? (/^http_\d+$/.test(code) ? d.proxies.whyHttp(code.slice(5)) : null));
// Why a profile didn't open. A failed proxy check comes as 'proxy_down:<why>' and says why it failed.
export function launchWhy(d: Dict, code: string){
  const [c, reason = null] = code.split(':');
  const why = c === 'proxy_down' ? checkWhy(d, reason) : null;
  return why ? d.proxies.launchWhy(why) : d.launch[c] ?? d.launch.launch_failed;
}
// A role's wording: the four every workspace starts with are translated, a workspace's own keeps its name.
export const roleName = (d: Dict, r: { key: string | null; name: string }) => (r.key ? d.roles[r.key as keyof Dict['roles']] : r.name);
