import type { Problem } from './csv';
import type { CheckId } from './checks';
import type { ActivityAction } from './api';
import type { Step } from '@shared/bridge';

export type Lang = 'en' | 'zh';
type CheckText = { t: (x: CheckVars) => string; d: (x: CheckVars) => string };
// Activity entries: who did it comes first; `p` is the profile ("Shop-07 #0007"), `x` the entry's details.
type Said = (p: string, x: Record<string, any>) => string;
export interface CheckVars { ms: number; host: string; city: string; tz: string; set: string; setLang: string; lang: string; country: string; version: string; latest: string; size: string; kernel: string }

const profilesN = (n: number) => (n === 1 ? '1 profile' : `${n} profiles`);
const proxiesN = (n: number) => (n === 1 ? '1 proxy' : `${n} proxies`);

const enFields: Record<string, string> = { name: 'name', groupId: 'group', tags: 'tags', proxyId: 'proxy', ownerId: 'owner', departmentId: 'department', kernelVersion: 'engine version', fingerprint: 'fingerprint', os: 'system', timezoneOverride: 'time zone', localeOverride: 'language', notes: 'notes', type: 'type', host: 'host', port: 'port', username: 'username', password: 'password', backupId: 'backup line' };
const enRoles: Record<string, string> = { admin: 'an admin', member: 'a member', owner: 'the owner' };
const zhFields: Record<string, string> = { name: '名称', groupId: '分组', tags: '标签', proxyId: '代理', ownerId: '负责人', departmentId: '部门', kernelVersion: '内核版本', fingerprint: '指纹', os: '系统', timezoneOverride: '时区', localeOverride: '语言', notes: '备注', type: '类型', host: '主机', port: '端口', username: '用户名', password: '密码', backupId: '备用线路' };
const zhRoles: Record<string, string> = { admin: '管理员', member: '成员', owner: '所有者' };

export const en = {
  login: {
    title: 'Log in to Folio', lead: 'Use the account you created on the Folio website.',
    email: 'Email', password: 'Password', submit: 'Log in',
    noAccount: 'No account yet?', create: 'Create one on the website', forgot: 'Forgot your password?'
  },
  nav: { profiles: 'Profiles', proxies: 'Proxies', flows: 'Flows', sync: 'Window sync', tasks: 'Scheduled tasks', api: 'API & scripts', team: 'Team', activity: 'Activity log', trash: 'Trash', soon: 'Soon', soonHint: 'Arrives in an upcoming update' },
  groups: {
    title: 'Groups', all: 'All profiles', none: 'No group', add: 'New group', namePh: 'Group name', more: (g: string) => `More for ${g}`,
    rename: 'Rename', delete: 'Delete', deleteConfirm: (g: string) => `Delete “${g}”? Its profiles stay, without a group.`
  },
  plans: { free: 'Free', studio: 'Studio', company: 'Company' },
  periods: { monthly: 'monthly', yearly: 'yearly' },
  roles: { owner: 'Owner', admin: 'Admin', member: 'Member' },
  ws: { switch: 'Switch workspace', current: 'Current workspace' },
  plan: {
    usage: (used: number, limit: number) => `${used} of ${limit} profiles`,
    renews: (date: string, period: string) => `Renews ${date}, ${period}`,
    ends: (date: string) => `Ends ${date}`,
    trialEnds: (date: string) => `Free trial ends ${date}`,
    scheduled: (plan: string, date: string) => `Becomes ${plan} on ${date}`,
    upgrade: 'Upgrade', addProfiles: 'Add profiles', manage: 'Billing'
  },
  user: { language: 'Language', engines: 'Browser engines', exportAll: 'Export all data…', importAll: 'Import data…', logout: 'Log out', startup: 'Start with this computer (minimized)' },
  tray: { open: 'Open Folio', quit: 'Quit Folio', background: 'Folio keeps running in the background so scheduled tasks run on time. Quit it from the tray icon.' },
  notify: { signedOut: (task: string, names: string[]) => ({ title: names.length === 1 ? `${names[0]} is signed out` : `${names.length} profiles are signed out`, body: `${task}: ${names.join(', ')}` }) },
  common: {
    cancel: 'Cancel', save: 'Save', close: 'Close', undo: 'Undo', check: 'Check', checking: 'Checking…', edit: 'Edit',
    selected: (n: number) => `${n} selected`, clearSelection: 'Clear selection', selectAll: 'Select all shown', select: (x: string) => `Select ${x}`,
    never: 'Never', justNow: 'Just now', minAgo: (n: number) => `${n} min ago`, hAgo: (n: number) => `${n} h ago`, yesterday: 'Yesterday', daysAgo: (n: number) => `${n} days ago`,
    attribution: 'IP Geolocation by DB-IP'
  },
  os: { windows: 'Windows', macos: 'macOS', linux: 'Linux' },
  profiles: {
    title: 'Profiles', count: profilesN,
    sub: (n: number, running: number) => `${profilesN(n)} · ${running} running`,
    showing: (shown: number, n: number, running: number) => `Showing ${shown} of ${n} · ${running} running`,
    search: 'Search profiles', searchPh: 'Search name, number, city or tag', new: '+ New profile', import: 'Import',
    sum: {
      running: 'Running now', of: (n: number) => ` of ${n}`, runningSub: 'On this computer',
      proxy: 'Proxy problems', proxyOk: 'All proxies answering', proxyNote: (down: number, slow: number) => [down && `${down} not answering`, slow && `${slow} slow`].filter(Boolean).join(' · '),
      fp: 'Fingerprint warnings', fpOk: 'Everything matches its proxy', fpNote: (n: number) => (n === 1 ? 'Doesn’t match its proxy' : `${n} don’t match their proxy`),
      usage: 'Plan usage', usageOf: (n: number) => ` / ${n} profiles`
    },
    filter: { label: 'Status', all: 'All', running: 'Running', issues: 'Needs attention' },
    groupChip: (g: string) => `Group: ${g}`, clearGroup: (g: string) => `Clear group filter ${g}`,
    sort: 'Sort', sorts: { recent: 'Recently opened', name: 'Name A–Z', latency: 'Proxy latency' },
    cols: { profile: 'Profile', proxy: 'Proxy', fingerprint: 'Fingerprint', last: 'Last opened', status: 'Status' },
    open: 'Open', stop: 'Stop', openX: (n: string) => `Open ${n}`, stopX: (n: string) => `Stop ${n}`, starting: 'Starting…', inUse: 'In use now', runningFor: 'Running for ',
    restoring: 'Restoring sign-ins…', saving: 'Saving sign-ins…', inUseOn: (where: string) => `In use on ${where}`,
    downloading: (pct: number) => `Downloading engine… ${pct}%`,
    noProxy: 'No proxy', unchecked: 'Not checked', noResponse: 'No response', ms: (n: number) => `${n} ms`, mismatch: '! Doesn’t match its proxy',
    unassigned: 'Unassigned',
    emptyNone: 'No profiles yet.', emptyMatch: 'No profiles match.', emptyFor: (q: string) => `Nothing found for “${q}”.`,
    emptyHint: (n: number) => `Try another search, or clear the filters to see all ${n}.`, clearFilters: 'Clear filters',
    bulk: {
      open: 'Open', stop: 'Stop', move: 'Move to group…', proxy: 'Set proxy…', assign: 'Assign to…', department: 'Department…', noDepartment: 'No department',
      tag: 'Tag', tagPh: 'Tag name', addTag: 'Add tag', removeTag: 'Remove tag', trash: 'Delete', cookies: 'Export cookies…',
      confirm: (n: number) => `Move ${profilesN(n)} to Trash?`, confirmNote: 'Running ones are stopped first. You can undo this.', doTrash: 'Move to Trash'
    },
    done: {
      trashed: (n: number) => `${profilesN(n)} moved to Trash`, moved: (n: number, g: string) => `${profilesN(n)} moved to ${g}`,
      tagged: (n: number, t: string) => `Tagged ${profilesN(n)} “${t}”`, untagged: (n: number, t: string) => `Removed “${t}” from ${profilesN(n)}`,
      proxySet: (n: number) => `Proxy changed on ${profilesN(n)}`, assigned: (n: number, who: string) => `${profilesN(n)} assigned to ${who}`,
      departmentSet: (n: number) => `Department changed on ${profilesN(n)}`, created: (x: string) => `${x} is ready`, saved: 'Saved', failed: (name: string, why: string) => `${name}: ${why}`,
      stale: 'Someone changed this profile in the meantime. Try again.'
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
    profile: 'Profile', close: 'Close details', emptyTitle: 'No profile selected.', emptyBody: 'Pick one from the list to see its fingerprint and proxy check.',
    meta: (group: string, date: string) => `${group} · Created ${date}`, assignedTo: (who: string) => `Assigned to ${who}`,
    openProfile: 'Open profile', edit: 'Edit', trash: 'Move to Trash',
    card: 'FOLIO · BROWSER PROFILE', notChecked: 'Exit not checked yet', direct: 'Direct connection', directSub: 'Sites see this computer’s IP',
    fields: { ip: 'Exit IP', lang: 'Language', tz: 'Time zone', os: 'OS', engine: 'Engine', seed: 'Fingerprint seed', cores: 'CPU cores', screen: 'Screen', gpu: 'WebGL GPU', proxy: 'Proxy' },
    hostTz: 'This computer’s', stamps: { ok: 'ISOLATED', warn: 'REVIEW', bad: 'OFFLINE' }, cardLabel: (n: string) => `Fingerprint of ${n}`,
    checksTitle: 'Consistency check', notes: 'Notes', status: { ok: 'Passed', warn: 'Warning', bad: 'Problem' },
    storage: 'Sign-ins', cookies: 'Cookies', siteData: 'Site storage', sites: 'Sites', savedOn: (when: string, device: string | null) => `Saved ${when}${device ? ` on ${device}` : ''}`,
    notSaved: 'Nothing saved yet. Sign-ins are saved when the browser closes.', localOnly: 'Kept on the computer that uses it; Folio holds no copy.',
    exportCookies: 'Export cookies', importCookies: 'Import cookies', json: 'JSON', netscape: 'cookies.txt',
    exported: (n: number, path: string) => `${profilesN(n)} exported to ${path}`, imported: (n: number) => `${n} ${n === 1 ? 'cookie' : 'cookies'} imported`,
    exportFailed: (name: string, why: string) => `${name}: ${why}`,
    inUse: 'In use elsewhere', away: (device: string, email: string, since: string) => `Open on ${device} (${email}) since ${since}.`,
    takeover: 'Take over', takeoverNote: 'Their browser closes. Changes made there in the last few minutes are lost.', takeoverDo: 'Take over and open'
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
    'tz-mismatch': { t: () => 'Time zone doesn’t match the exit IP', d: x => `Set by hand to ${x.set}, but the proxy exits in ${x.city}, which is on ${x.tz}.` },
    'lang-ok': { t: () => 'Language matches the region', d: x => x.lang },
    'lang-mismatch': { t: () => 'Language doesn’t match the exit IP', d: x => `Set by hand to ${x.setLang}, but the proxy exits in ${x.country}.` },
    geo: { t: x => `Geolocation set near ${x.city}`, d: () => 'Accuracy about 50 m' },
    rtc: { t: () => 'WebRTC shows the proxy IP only', d: () => 'The real IP of this computer stays hidden' },
    'engine-ok': { t: x => `${x.kernel} ${x.version}`, d: () => 'The newest engine on this computer' },
    'engine-older': { t: x => `${x.kernel} ${x.version}`, d: x => `${x.latest} is available. The fingerprint stays the same when you upgrade.` },
    'engine-missing': { t: x => `${x.kernel} ${x.version} isn’t downloaded yet`, d: x => `About ${x.size}, once for all profiles. It downloads when you open the profile.` },
    'engine-unavailable': { t: x => `${x.kernel} ${x.version} isn’t built for this computer’s system`, d: x => `Use ${x.latest} for this profile to open it here.` }
  } satisfies Record<CheckId, CheckText>,
  fixes: { check: 'Check again', backup: 'Make the backup the main line', 'choose-proxy': 'Choose a proxy', 'follow-tz': 'Follow the proxy', 'follow-lang': 'Follow the proxy', download: 'Download', use: (v: string) => `Use ${v}` },
  form: {
    newTitle: 'New profile', editTitle: 'Edit profile', name: 'Name', defaultName: (n: number) => `Profile ${n}`, nameErr: 'Give it a name.',
    group: 'Group', noGroup: 'No group', newGroup: 'New group…', newGroupPh: 'Name of the new group',
    engine: 'Engine', recommended: 'Recommended', firefoxNote: 'Firefox engine: about 1.3 GB, downloaded once.', os: 'Operating system',
    proxy: 'Proxy', noProxy: 'No proxy (this computer’s IP)', pasteProxy: 'Paste a new proxy…', pastePh: 'socks5://user:pass@host:port',
    proxyAdded: 'Added to Proxies.', proxyBad: 'That doesn’t look like a proxy address.',
    proxyOk: (place: string, ms: number) => `Answers in ${ms} ms, exits in ${place}`, proxyDown: 'The proxy didn’t answer.',
    tags: 'Tags', tagsPh: 'Comma-separated', fp: 'Fingerprint', regen: 'Regenerate', fpHint: 'Time zone, language and geolocation follow the proxy.',
    regenWarn: 'Sites will see a new device; logged-in sites may ask you to verify again.', fpErr: 'Couldn’t make a fingerprint.',
    firefoxMissing: 'Download the Firefox engine to make this fingerprint.', download: 'Download', downloading: (pct: number) => `Downloading… ${pct}%`,
    create: 'Create profile', save: 'Save changes', tz: 'Time zone', lang: 'Language', follow: 'Follow the proxy', custom: 'Set by hand',
    tzPh: 'Europe/Berlin', langPh: 'de-DE', tzErr: 'Not a time zone this computer knows.', langErr: 'Use a language tag like de-DE.',
    notes: 'Notes', engineVersion: 'Engine version', owner: 'Assigned to', department: 'Department', noDepartment: 'No department',
    sync: 'Sign-ins', syncCloud: 'Save to Folio and follow the profile', syncLocal: 'Keep on the computer that uses it',
    syncHelp: 'Kept on one computer, sign-ins never leave it, and the profile opens signed out anywhere else.',
    stale: 'Someone changed this profile while you were editing. Save again to replace their changes, or cancel to keep them.'
  },
  importer: {
    title: 'Import profiles', lead: 'One profile per row with a header row. Save Excel sheets as CSV first; up to 500 rows at a time.',
    columns: 'Columns: name (required), group, tags (separated by |), os (windows, macos, linux), engine (chromium, firefox), proxy, timezone, language, notes, cookies (JSON or cookies.txt text).',
    example: 'Insert an example', file: 'Choose a file…', pasteLabel: 'CSV', ready: (n: number) => `${profilesN(n)} ready to import.`,
    problems: 'Fix these rows first:', row: (n: number) => `Row ${n}`, header: 'The first row needs a “name” column.',
    errs: { name: 'the name is missing or too long', os: 'unknown system', engine: 'unknown engine', tags: 'up to 10 tags of 24 characters', timezone: 'unknown time zone', language: 'not a language tag', proxy: 'the proxy can’t be read', cookies: 'no cookies could be read', header: '' } satisfies Record<Problem | 'proxy', string>,
    tooMany: 'Up to 500 rows at a time.', room: (free: number) => `The plan has room for ${profilesN(free)} more.`, firefox: 'Some rows use Firefox: download its engine first.',
    submit: (n: number) => `Import ${profilesN(n)}`, steps: { proxies: 'Adding proxies…', groups: 'Creating groups…', fingerprints: (i: number, n: number) => `Making fingerprints… ${i} / ${n}`, saving: 'Saving…', cookies: (i: number, n: number) => `Importing cookies… ${i} / ${n}` },
    done: (n: number) => `${profilesN(n)} imported`
  },
  proxies: {
    title: 'Proxies', count: proxiesN, sub: (n: number, down: number) => `${proxiesN(n)}${down ? ` · ${down} not answering` : ''}`,
    search: 'Search proxies', searchPh: 'Search name, host or city', add: '+ Add proxy', import: 'Import', checkAll: 'Check all',
    cols: { proxy: 'Proxy', exit: 'Exit', check: 'Last check', profiles: 'Profiles', backup: 'Backup line' },
    never: 'Not checked', noResponse: (why: string) => `No response${why === 'timeout' ? ' within 10 s' : ''}`, none: '—',
    empty: 'No proxies yet. Add one, or import a list from your provider.',
    bulkCheck: 'Check', bulkDelete: 'Delete', confirmDelete: (n: number) => `Delete ${proxiesN(n)}?`, confirmNote: 'Profiles that use them keep working without a proxy.',
    deleted: (n: number) => `${proxiesN(n)} deleted`, checked: (n: number) => `Checked ${proxiesN(n)}`, editX: (n: string) => `Edit ${n}`, checkX: (n: string) => `Check ${n}`,
    formAdd: 'Add proxy', formEdit: 'Edit proxy', name: 'Name', namePh: 'Defaults to host:port', type: 'Type', host: 'Host', port: 'Port',
    user: 'Username', pass: 'Password', passKeep: 'Saved. Leave empty to keep it.', passRemove: 'Remove the saved password',
    backup: 'Backup line', backupNone: 'None', backupHint: 'Used automatically when this line doesn’t answer.',
    hostErr: 'Enter a host name or IP address.', portErr: 'Ports go from 1 to 65535.',
    importTitle: 'Import proxies', importLead: 'One per line, in any of these formats:', defaultType: 'Type for lines without one',
    importBtn: 'Import', imported: (added: number, known: number) => `${proxiesN(added)} added${known ? `, ${known} already saved` : ''}`,
    badLines: 'These lines couldn’t be read:', line: (n: number) => `Line ${n}`
  },
  trash: {
    title: 'Trash', sub: (n: number) => `${profilesN(n)} · not counted toward the plan`, empty: 'The Trash is empty.',
    deleted: 'Deleted', restore: 'Restore', purge: 'Delete forever', purgeAll: 'Empty Trash',
    confirmPurge: (n: number) => `Delete ${profilesN(n)} forever?`, confirmNote: 'Their fingerprints and settings can’t be recovered.',
    restored: (n: number) => `${profilesN(n)} restored`, purged: (n: number) => `${profilesN(n)} deleted forever`
  },
  engines: {
    title: 'Browser engines', lead: 'Each profile keeps the engine version it was made with, so it looks the same to sites until you choose to upgrade it.',
    installed: 'Downloaded', download: (size: string) => `Download · ${size}`, usedBy: profilesN, failed: 'The download failed.', recommended: 'Default for new profiles'
  },
  team: {
    title: 'Team', sub: (n: number, seats: number | null) => `${n === 1 ? '1 person' : `${n} people`}${seats === null ? '' : ` · ${seats} ${seats === 1 ? 'seat' : 'seats'} on the plan`}`,
    invite: '+ Invite', you: 'you', remove: 'Remove', leave: 'Leave team', removeX: (e: string) => `Remove ${e}`, roleOf: (e: string) => `Role of ${e}`,
    cols: { person: 'Person', role: 'Role', departments: 'Departments', profiles: 'Profiles', joined: 'Joined' },
    roleHelp: { admin: 'Sees and manages every profile, proxy and person.', member: 'Sees and opens the profiles assigned to them; can create and edit, not delete.' },
    pending: 'Invitations waiting', invitedBy: (who: string) => `Invited by ${who}`, expires: (date: string) => `expires ${date}`,
    copyLink: 'Copy link', copied: 'Invitation link copied', resend: 'Send again', withdraw: 'Withdraw', withdrawn: 'Invitation withdrawn',
    inviteTitle: 'Invite to the team', email: 'Email', emailErr: 'Enter an email address.', role: 'Role', departments: 'Departments',
    send: 'Send invitation', sent: (e: string) => `Invitation sent to ${e}.`, notSent: 'The email couldn’t be sent. Copy the link and pass it on yourself.',
    link: 'Invitation link', done: 'Done',
    removeTitle: (e: string) => `Remove ${e}`, removeLead: 'Their profiles go to the person you choose. Anything they have open closes on their computer, and their copies there are deleted.',
    heir: 'Give their profiles to', removeDo: 'Remove from team', removed: (e: string) => `${e} was removed`,
    leaveTitle: (ws: string) => `Leave ${ws}?`, leaveLead: 'Your profiles there go to the owner, and you lose access to the workspace.', leaveDo: 'Leave',
    removedYou: (ws: string) => `You’re no longer in ${ws}. Its profiles were closed and removed from this computer.`,
    depts: 'Departments', deptAdd: '+ Department', deptName: 'Department name', deptNone: 'No departments yet.',
    deptHelp: 'Members see the profiles of their departments as well as their own.', deptCompany: 'Departments come with the Company plan.',
    deptMembers: 'Members', deptDelete: 'Delete', deptDeleteConfirm: (n: string) => `Delete “${n}”? Its profiles stay, without a department.`, deptProfiles: (n: number) => profilesN(n),
    invites: 'Invitations to you', join: 'Join', decline: 'Decline', from: (who: string, role: string) => `From ${who}, as ${role}`
  },
  activity: {
    title: 'Activity log', sub: (days: number) => `Kept for ${days} days on this plan`, person: 'Person', everyone: 'Everyone', kind: 'Showing',
    kinds: { all: 'Everything', open: 'Opening and closing', profiles: 'Profile changes', trash: 'Trash', proxies: 'Proxies and groups', cookies: 'Cookies and exports', team: 'Team', automation: 'Automation' },
    export: 'Export CSV', exported: (path: string) => `Saved to ${path}`, more: 'Show older', empty: 'Nothing here yet.', someone: 'Someone', recent: 'Recent activity',
    today: 'Today', yesterday: 'Yesterday', on: (device: string) => `on ${device}`,
    actions: {
      'profile.create': p => `created ${p}`, 'profile.update': (p, x) => `changed the ${x.fields?.map((f: string) => enFields[f] ?? f).join(', ')} of ${p}`,
      'profile.move': (p, x) => (x.group ? `moved ${p} to ${x.group}` : `took ${p} out of its group`), 'profile.tag': (p, x) => `tagged ${p} “${x.tag}”`,
      'profile.untag': (p, x) => `removed the tag “${x.tag}” from ${p}`, 'profile.set-proxy': (p, x) => (x.proxy ? `set the proxy of ${p} to ${x.proxy}` : `removed the proxy of ${p}`),
      'profile.assign': (p, x) => (x.to ? `assigned ${p} to ${x.to}` : `unassigned ${p}`), 'profile.set-department': (p, x) => (x.department ? `put ${p} in ${x.department}` : `took ${p} out of its department`),
      'profile.trash': p => `moved ${p} to the Trash`, 'profile.restore': p => `restored ${p}`, 'profile.purge': p => `deleted ${p} for good`,
      'profile.open': (p, x) => (x.via === 'api' ? `opened ${p} through the API` : `opened ${p}`), 'profile.close': p => `closed ${p}`, 'profile.takeover': (p, x) => `took over ${p} from ${x.from ?? 'another computer'}`,
      'proxy.create': (_p, x) => `added the proxy ${x.name}`, 'proxy.import': (_p, x) => `imported ${x.added} ${x.added === 1 ? 'proxy' : 'proxies'}`,
      'proxy.update': (_p, x) => `changed the proxy ${x.name}`, 'proxy.delete': (_p, x) => `deleted the proxy ${x.name}`,
      'group.create': (_p, x) => `created the group ${x.name}`, 'group.rename': (_p, x) => `renamed the group ${x.from} to ${x.name}`, 'group.delete': (_p, x) => `deleted the group ${x.name}`,
      'member.invite': (_p, x) => `invited ${x.email} as ${enRoles[x.role]}`, 'member.join': (_p, x) => `joined as ${enRoles[x.role]}`,
      'member.role': (_p, x) => `made ${x.email} ${enRoles[x.role]}`, 'member.remove': (_p, x) => `removed ${x.email}; their profiles went to ${x.to}`,
      'member.leave': () => 'left the team', 'invitation.withdraw': (_p, x) => `withdrew the invitation to ${x.email}`,
      'department.create': (_p, x) => `created the department ${x.name}`, 'department.update': (_p, x) => (x.from ? `renamed the department ${x.from} to ${x.name}` : `changed who is in ${x.name}`),
      'department.delete': (_p, x) => `deleted the department ${x.name}`,
      'cookies.export': (p, x) => `exported ${x.count} ${x.count === 1 ? 'cookie' : 'cookies'} of ${p}`, 'cookies.import': (p, x) => `imported ${x.count} ${x.count === 1 ? 'cookie' : 'cookies'} into ${p}`,
      'workspace.export': (_p, x) => `exported all data (${profilesN(x.profiles)}, ${x.proxies} ${x.proxies === 1 ? 'proxy' : 'proxies'})`,
      'workspace.import': (_p, x) => `imported ${profilesN(x.profiles)}, ${x.proxies} new ${x.proxies === 1 ? 'proxy' : 'proxies'} and ${x.groups} new ${x.groups === 1 ? 'group' : 'groups'}`,
      'flow.create': (_p, x) => `created the flow ${x.name}`, 'flow.update': (_p, x) => (x.from ? `renamed the flow ${x.from} to ${x.name}` : `changed the flow ${x.name}`),
      'flow.delete': (_p, x) => `deleted the flow ${x.name}`,
      'task.create': (_p, x) => `created the task ${x.name}`, 'task.update': (_p, x) => (x.from ? `renamed the task ${x.from} to ${x.name}` : `changed the task ${x.name}`),
      'task.delete': (_p, x) => `deleted the task ${x.name}`, 'run.start': (_p, x) => `started ${x.name} on ${profilesN(x.profiles)}${x.trigger === 'rerun' ? ' (again)' : ''}`,
      'run.finish': (_p, x) => `${x.name} ${x.status === 'stopped' ? 'stopped' : 'finished'}: ${x.ok} done, ${x.failed} failed${x.signedOut ? `, ${x.signedOut} signed out` : ''}${x.skipped ? `, ${x.skipped} not run` : ''}`
    } satisfies Record<ActivityAction, Said>
  },
  transfer: {
    exportTitle: 'Export all data', exportLead: 'One file with every profile (fingerprints and settings), its sign-ins, the groups and the proxies with their passwords. Profiles in the Trash stay behind.',
    passphrase: 'Passphrase', confirm: 'Passphrase again', passHelp: 'At least 10 characters. The file opens only with it, and it is not kept anywhere: if it is lost, so is the file.',
    passShort: 'Use at least 10 characters.', passMismatch: 'The two passphrases differ.', export: 'Export', exporting: 'Exporting…', exported: (path: string) => `Saved to ${path}`,
    importTitle: 'Import data', importLead: 'Brings a .folio file into this workspace: its profiles are added and numbered here, and identical proxies and same-named groups are reused.',
    choose: 'Choose a .folio file…', unlock: 'Unlock', unlocking: 'Unlocking…',
    preview: (p: { workspace: string; profiles: number; proxies: number; groups: number; signedIn: number }) => `From ${p.workspace}: ${profilesN(p.profiles)} (${p.signedIn} with sign-ins), ${p.proxies} ${p.proxies === 1 ? 'proxy' : 'proxies'}, ${p.groups} ${p.groups === 1 ? 'group' : 'groups'}.`,
    room: (free: number) => `The plan has room for ${profilesN(free)} more.`, import: 'Import', importing: 'Importing…',
    imported: (r: { profiles: number; proxies: number; groups: number; signedIn: number }) => `${profilesN(r.profiles)} imported, ${r.signedIn} with sign-ins; ${r.proxies} new ${r.proxies === 1 ? 'proxy' : 'proxies'}, ${r.groups} new ${r.groups === 1 ? 'group' : 'groups'}`
  },
  flows: {
    title: 'Flows', sub: (n: number) => (n === 1 ? '1 flow · shared with the team' : `${n} flows · shared with the team`), new: '+ New flow',
    template: 'Sign-in check template', templateName: 'Sign-in check',
    cols: { name: 'Flow', steps: 'Steps', by: 'Created by', updated: 'Changed' },
    empty: 'No flows yet. A flow is a list of steps (open a page, click, type, extract…) that runs on one profile or many.',
    you: 'You', view: 'View', duplicate: 'Duplicate', duplicateToEdit: 'Duplicate to edit', delete: 'Delete', deleteX: (n: string) => `Delete ${n}`,
    inUse: (tasks: string) => `Used by ${tasks}; it can’t be deleted.`, confirmDelete: (n: string) => `Delete “${n}”?`, deleted: (n: string) => `${n} deleted`, copyName: (n: string) => `${n} (copy)`, untitled: 'New flow',
    back: '← Flows', name: 'Flow name', save: 'Save', saving: 'Saving…', saved: 'Flow saved',
    leave: 'Leave without saving your changes?', keepEditing: 'Keep editing', discard: 'Discard changes',
    readOnly: 'Only whoever created this flow, admins and the owner can change it. Duplicate it to make your own version.',
    stale: 'Someone saved this flow while you were editing. Save again to replace their version with yours.',
    issues: (n: number) => (n === 1 ? '1 step needs filling in before saving.' : `${n} steps need filling in before saving.`),
    steps: 'Steps', noSteps: 'Add the first step.', add: '+ Add step',
    types: { open: 'Open URL', click: 'Click', type: 'Type', press: 'Press key', wait: 'Wait', scroll: 'Scroll', extract: 'Extract', set: 'Set variable', if: 'If', loop: 'Repeat', screenshot: 'Screenshot', script: 'Run script', signedIn: 'Check signed in' } satisfies Record<Step['type'], string>,
    up: (p: string) => `Move step ${p} up`, down: (p: string) => `Move step ${p} down`, copyStep: (p: string) => `Duplicate step ${p}`, remove: (p: string) => `Remove step ${p}`,
    then: 'Then', else: 'Otherwise', each: 'Each time',
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
    title: 'Scheduled tasks', sub: (n: number) => (n === 1 ? '1 task' : `${n} tasks`), new: '+ New task', needFlow: 'Make a flow first, on the Flows page.',
    empty: 'No tasks yet. A task runs a flow on a set of profiles, a few at a time, and keeps each run’s results.',
    cols: { task: 'Task', profiles: 'Profiles', when: 'When', last: 'Last run', by: 'Created by', profile: 'Profile', status: 'Result', attempts: 'Tries', time: 'Time', result: 'Details' },
    never: 'Not run yet', manual: 'By hand', next: (at: string) => `Next: ${at}`, done: 'Its time has passed', on: (device: string) => `On ${device}`,
    once: (at: string) => `Once, ${at}`, everyDay: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends', dayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    onlyOpen: 'Scheduled tasks run on their computer while Folio is open and logged in there; times missed are recorded, not run late.', enableStartup: 'Start Folio with this computer',
    run: 'Run', runX: (n: string) => `Run ${n}`, stop: 'Stop', delete: 'Delete', deleteX: (n: string) => `Delete ${n}`,
    confirmDelete: (n: string) => `Delete “${n}” and its runs?`, deleted: (n: string) => `${n} deleted`, started: (n: string) => `${n} started on this computer`,
    saved: 'Task saved', stale: 'Someone changed this task in the meantime. Open it again and redo your change.',
    status: { running: 'Running', done: 'Finished', stopped: 'Stopped', interrupted: 'Interrupted', missed: 'Missed', busy: 'Skipped' },
    progress: (done: number, all: number) => `${done} of ${all} done`, elsewhere: (where: string) => `on ${where}`,
    counts: (c: { ok: number; failed: number; signed_out: number; skipped: number; canceled: number }) => [c.ok && `${c.ok} done`, c.signed_out && `${c.signed_out} signed out`, c.failed && `${c.failed} failed`, c.skipped && `${c.skipped} skipped`, c.canceled && `${c.canceled} not run`].filter(Boolean).join(' · ') || 'Nothing ran',
    back: '← Tasks', about: (flow: string, n: number, conc: number, retries: number) => `${flow} · ${profilesN(n)} · ${conc} at a time · ${retries === 0 ? 'no retries' : retries === 1 ? '1 retry' : `${retries} retries`}`,
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
    title: 'API & scripts', sub: 'Let scripts on this computer open profiles and drive them with Playwright, Puppeteer or Selenium.', reference: 'API reference',
    server: 'Local API', enable: 'On', listening: 'Listening on', off: 'Off. Turn it on to let scripts on this computer use it.', copy: 'Copy', copied: 'Copied',
    errors: { port_in_use: 'Another program uses this port. Pick another one.', listen_failed: 'The API couldn’t start on this port. Pick another one.' },
    port: 'Port', limit: 'Up to 60 requests a minute (starting, stopping, looking things up). What scripts send to the browser itself isn’t counted. Company is unthrottled.',
    unthrottled: 'Company plan: no limit on requests.',
    security: 'The debugging address has no password: while a profile opened through the API is running, any program on this computer can control it. Profiles you open yourself have no debugging address.',
    tokens: 'Tokens', tokensHelp: 'Scripts send one as Authorization: Bearer <token>. A token belongs to you and this workspace, works only on this computer, and can do what you can.',
    newToken: 'Copy this token now; it isn’t shown again.', done: 'Done', tokenName: 'Name, e.g. order sync', createToken: 'Make a token', defaultName: 'Token',
    made: (date: string) => `Made ${date}`, used: (date: string) => `last used ${date}`, unused: 'not used yet', revoke: 'Revoke', revokeX: (n: string) => `Revoke ${n}`, otherWorkspace: 'Another workspace',
    examples: 'Examples', exampleNames: { playwright: 'Playwright', puppeteer: 'Puppeteer', selenium: 'Selenium', firefox: 'Firefox profiles' },
    chromiumNote: 'Chromium profiles answer with a CDP address: Playwright, Puppeteer, Selenium (with chromedriver for Chromium 150) or any CDP client can take over.',
    firefoxNote: 'Firefox profiles answer with a WebDriver BiDi address: Puppeteer or another WebDriver BiDi client can take over. Playwright and Selenium can’t attach to a running Firefox. While a script drives one, tasks skip it.',
    endpoints: 'Endpoints',
    routes: [
      ['GET /api/v1/profiles', 'The profiles you can see, and whether they run'], ['POST /api/v1/profiles/{number}/start', 'Opens a profile and answers with its debugging address'],
      ['GET /api/v1/profiles/{number}', 'Whether it runs, with its address when opened through the API'], ['POST /api/v1/profiles/{number}/stop', 'Closes it, saving its sign-ins'],
      ['GET /api/v1/tasks', 'Your workspace’s tasks'], ['POST /api/v1/tasks/{id}/run', 'Runs a task on this computer'], ['GET /api/v1/runs/{id}', 'How a run is going, profile by profile']
    ] as [string, string][]
  },
  onboarding: {
    head: 'FOLIO · GETTING STARTED', title: 'Your first profile in three minutes', hide: 'Hide',
    proxy: 'Add a proxy', proxyD: 'Paste one in any common format.', profile: 'Create a profile', profileD: 'Pick a system; the fingerprint is made for you.',
    open: 'Open it', openD: 'The browser starts with the time zone and language of the proxy.', done: 'Done'
  },
  loading: 'Loading…', retry: 'Try again',
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
    department_exists: 'There’s already a department with that name.',
    plan_required: 'Departments come with the Company plan.',
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
    no_device: 'Log out and back in to this app once before scheduling tasks on this computer.',
    already_run: 'This scheduled time has already run.'
  } as Record<string, string>
};

export type Dict = typeof en;

export const zh: Dict = {
  login: {
    title: '登录 Folio', lead: '使用你在 Folio 官网注册的账号。',
    email: '邮箱', password: '密码', submit: '登录',
    noAccount: '还没有账号？', create: '去官网注册', forgot: '忘记密码？'
  },
  nav: { profiles: '环境', proxies: '代理', flows: '流程', sync: '窗口同步', tasks: '定时任务', api: 'API 与脚本', team: '团队', activity: '操作日志', trash: '回收站', soon: '即将推出', soonHint: '会在后续版本中推出' },
  groups: {
    title: '分组', all: '全部环境', none: '未分组', add: '新建分组', namePh: '分组名称', more: (g: string) => `${g} 的更多操作`,
    rename: '重命名', delete: '删除', deleteConfirm: (g: string) => `删除「${g}」？组里的环境会保留，变为未分组。`
  },
  plans: { free: '体验版', studio: '工作室版', company: '公司版' },
  periods: { monthly: '月付', yearly: '年付' },
  roles: { owner: '所有者', admin: '管理员', member: '成员' },
  ws: { switch: '切换团队', current: '当前团队' },
  plan: {
    usage: (used: number, limit: number) => `已用 ${used} / ${limit} 个环境`,
    renews: (date: string, period: string) => `${date} 续费 · ${period}`,
    ends: (date: string) => `${date} 到期`,
    trialEnds: (date: string) => `免费试用 ${date} 结束`,
    scheduled: (plan: string, date: string) => `${date} 起改为${plan}`,
    upgrade: '升级', addProfiles: '增加环境', manage: '账单'
  },
  user: { language: '语言', engines: '浏览器内核', exportAll: '导出全部数据…', importAll: '导入数据…', logout: '退出登录', startup: '开机自动启动（最小化）' },
  tray: { open: '打开 Folio', quit: '退出 Folio', background: 'Folio 会留在后台，让定时任务按时运行。要退出请用托盘图标。' },
  notify: { signedOut: (task: string, names: string[]) => ({ title: names.length === 1 ? `${names[0]} 掉线了` : `${names.length} 个环境掉线了`, body: `${task}：${names.join('、')}` }) },
  common: {
    cancel: '取消', save: '保存', close: '关闭', undo: '撤销', check: '检测', checking: '检测中…', edit: '编辑',
    selected: (n: number) => `已选 ${n} 个`, clearSelection: '取消选择', selectAll: '全选当前列表', select: (x: string) => `选择 ${x}`,
    never: '从未', justNow: '刚刚', minAgo: (n: number) => `${n} 分钟前`, hAgo: (n: number) => `${n} 小时前`, yesterday: '昨天', daysAgo: (n: number) => `${n} 天前`,
    attribution: 'IP Geolocation by DB-IP'
  },
  os: { windows: 'Windows', macos: 'macOS', linux: 'Linux' },
  profiles: {
    title: '环境', count: (n: number) => `${n} 个环境`,
    sub: (n: number, running: number) => `${n} 个环境 · ${running} 个运行中`,
    showing: (shown: number, n: number, running: number) => `显示 ${shown} / ${n} 个 · ${running} 个运行中`,
    search: '搜索环境', searchPh: '搜索名称、编号、城市或标签', new: '+ 新建环境', import: '导入',
    sum: {
      running: '正在运行', of: (n: number) => ` / ${n}`, runningSub: '在这台电脑上',
      proxy: '代理异常', proxyOk: '所有代理都有响应', proxyNote: (down: number, slow: number) => [down && `${down} 个无响应`, slow && `${slow} 个较慢`].filter(Boolean).join(' · '),
      fp: '指纹警告', fpOk: '全部与代理一致', fpNote: (n: number) => `${n} 个与代理不一致`,
      usage: '套餐用量', usageOf: (n: number) => ` / ${n} 个环境`
    },
    filter: { label: '状态', all: '全部', running: '运行中', issues: '需处理' },
    groupChip: (g: string) => `分组：${g}`, clearGroup: (g: string) => `清除分组筛选 ${g}`,
    sort: '排序', sorts: { recent: '最近打开', name: '名称 A–Z', latency: '代理延迟' },
    cols: { profile: '环境', proxy: '代理', fingerprint: '指纹', last: '最近打开', status: '状态' },
    open: '打开', stop: '停止', openX: (n: string) => `打开 ${n}`, stopX: (n: string) => `停止 ${n}`, starting: '启动中…', inUse: '正在使用', runningFor: '已运行 ',
    restoring: '正在恢复登录状态…', saving: '正在保存登录状态…', inUseOn: (where: string) => `${where} 正在使用`,
    downloading: (pct: number) => `下载内核… ${pct}%`,
    noProxy: '无代理', unchecked: '未检测', noResponse: '无响应', ms: (n: number) => `${n} ms`, mismatch: '! 与代理不一致',
    unassigned: '未分配',
    emptyNone: '还没有环境。', emptyMatch: '没有符合条件的环境。', emptyFor: (q: string) => `没有找到「${q}」。`,
    emptyHint: (n: number) => `换个关键词，或清除筛选查看全部 ${n} 个。`, clearFilters: '清除筛选',
    bulk: {
      open: '打开', stop: '停止', move: '移动到分组…', proxy: '设置代理…', assign: '分配给…', department: '部门…', noDepartment: '无部门',
      tag: '标签', tagPh: '标签名', addTag: '加标签', removeTag: '去掉标签', trash: '删除', cookies: '导出 Cookie…',
      confirm: (n: number) => `把 ${n} 个环境移到回收站？`, confirmNote: '运行中的会先停止，之后可以撤销。', doTrash: '移到回收站'
    },
    done: {
      trashed: (n: number) => `已把 ${n} 个环境移到回收站`, moved: (n: number, g: string) => `已把 ${n} 个环境移到「${g}」`,
      tagged: (n: number, t: string) => `已给 ${n} 个环境加上「${t}」`, untagged: (n: number, t: string) => `已从 ${n} 个环境去掉「${t}」`,
      proxySet: (n: number) => `已更换 ${n} 个环境的代理`, assigned: (n: number, who: string) => `已把 ${n} 个环境分配给 ${who}`,
      departmentSet: (n: number) => `已更换 ${n} 个环境的部门`, created: (x: string) => `「${x}」已创建`, saved: '已保存', failed: (name: string, why: string) => `${name}：${why}`,
      stale: '这个环境刚被别人改过，请重试。'
    }
  },
  launch: {
    kernel_missing: '这台电脑还没有下载这个内核。', proxy_down: '代理没有响应，也没有可用的备用线路。',
    in_trash: '这个环境在回收站里。', not_found: '这个环境已经不存在了。', launch_failed: '浏览器没能启动，请重试。',
    download_failed: '内核下载失败，请检查网络后重试。',
    locked: '这个环境正在另一台电脑上使用。',
    lock_lost: '有人在另一台电脑上收回了这个环境，这里已关闭。',
    save_failed: '浏览器已关闭，但登录状态没能保存到 Folio，仍保留在这台电脑上。'
  } as Record<string, string>,
  detail: {
    profile: '环境', close: '关闭详情', emptyTitle: '没有选中环境。', emptyBody: '从列表里选一个，查看它的指纹和代理检测结果。',
    meta: (group: string, date: string) => `${group} · ${date} 创建`, assignedTo: (who: string) => `负责人：${who}`,
    openProfile: '打开环境', edit: '编辑', trash: '移到回收站',
    card: 'FOLIO · BROWSER PROFILE', notChecked: '还没检测出口', direct: '直连', directSub: '网站看到的是这台电脑的 IP',
    fields: { ip: '出口 IP', lang: '语言', tz: '时区', os: '系统', engine: '内核', seed: '指纹种子', cores: 'CPU 核数', screen: '屏幕', gpu: 'WebGL 显卡', proxy: '代理' },
    hostTz: '跟随本机', stamps: { ok: 'ISOLATED', warn: 'REVIEW', bad: 'OFFLINE' }, cardLabel: (n: string) => `${n} 的指纹`,
    checksTitle: '一致性检查', notes: '备注', status: { ok: '通过', warn: '警告', bad: '问题' },
    storage: '登录状态', cookies: 'Cookie', siteData: '网站存储', sites: '站点', savedOn: (when: string, device: string | null) => `${when}${device ? ` 在 ${device} 上` : ''}保存`,
    notSaved: '还没有保存过。浏览器关闭时会保存登录状态。', localOnly: '只存在使用它的那台电脑上，Folio 不保留副本。',
    exportCookies: '导出 Cookie', importCookies: '导入 Cookie', json: 'JSON', netscape: 'cookies.txt',
    exported: (n: number, path: string) => `已导出 ${n} 个环境到 ${path}`, imported: (n: number) => `已导入 ${n} 个 Cookie`,
    exportFailed: (name: string, why: string) => `${name}：${why}`,
    inUse: '正在别处使用', away: (device: string, email: string, since: string) => `${since} 起在 ${device}（${email}）上打开。`,
    takeover: '收回', takeoverNote: '对方的浏览器会被关闭，最近几分钟内在那边的改动会丢失。', takeoverDo: '收回并打开'
  },
  checks: {
    'proxy-ok': { t: x => `代理正常 · ${x.ms} ms`, d: x => x.host },
    'proxy-slow': { t: x => `代理较慢 · ${x.ms} ms`, d: x => `${x.host}。页面可能会超时。` },
    'proxy-down': { t: () => '代理没有响应', d: x => `${x.host}。代理恢复前无法打开这个环境。` },
    'proxy-backup': { t: () => '主线路无响应，将改用备用线路', d: x => x.host },
    'proxy-none': { t: () => '没有代理', d: () => '网站看到的是这台电脑的 IP。' },
    'proxy-unchecked': { t: () => '代理还没检测', d: x => `${x.host}。检测后可以看到出口位置。` },
    'tz-ok': { t: () => '时区与出口 IP 一致', d: x => x.tz },
    'tz-host': { t: () => '时区跟随这台电脑', d: () => '没有代理时，网站本来就能看到这台电脑的位置。' },
    'tz-mismatch': { t: () => '时区与出口 IP 不一致', d: x => `手动设为 ${x.set}，但代理出口在 ${x.city}，那里是 ${x.tz}。` },
    'lang-ok': { t: () => '语言与地区一致', d: x => x.lang },
    'lang-mismatch': { t: () => '语言与出口 IP 不一致', d: x => `手动设为 ${x.setLang}，但代理出口在 ${x.country}。` },
    geo: { t: x => `地理位置设在 ${x.city} 附近`, d: () => '精度约 50 米' },
    rtc: { t: () => 'WebRTC 只显示代理 IP', d: () => '这台电脑的真实 IP 不会泄露' },
    'engine-ok': { t: x => `${x.kernel} ${x.version}`, d: () => '这台电脑上最新的内核' },
    'engine-older': { t: x => `${x.kernel} ${x.version}`, d: x => `可以升级到 ${x.latest}，指纹保持不变。` },
    'engine-missing': { t: x => `${x.kernel} ${x.version} 还没下载`, d: x => `约 ${x.size}，所有环境共用，只下载一次。打开环境时会自动下载。` },
    'engine-unavailable': { t: x => `${x.kernel} ${x.version} 没有这台电脑系统的版本`, d: x => `改用 ${x.latest} 就能在这里打开。` }
  },
  fixes: { check: '重新检测', backup: '把备用线路设为主线路', 'choose-proxy': '选择代理', 'follow-tz': '跟随代理', 'follow-lang': '跟随代理', download: '下载', use: (v: string) => `改用 ${v}` },
  form: {
    newTitle: '新建环境', editTitle: '编辑环境', name: '名称', defaultName: (n: number) => `环境 ${n}`, nameErr: '请填写名称。',
    group: '分组', noGroup: '未分组', newGroup: '新建分组…', newGroupPh: '新分组的名称',
    engine: '内核', recommended: '推荐', firefoxNote: 'Firefox 内核约 1.3 GB，只需下载一次。', os: '操作系统',
    proxy: '代理', noProxy: '不用代理（这台电脑的 IP）', pasteProxy: '粘贴新代理…', pastePh: 'socks5://用户名:密码@主机:端口',
    proxyAdded: '已加入代理列表。', proxyBad: '这看起来不是代理地址。',
    proxyOk: (place: string, ms: number) => `${ms} ms 响应，出口在 ${place}`, proxyDown: '代理没有响应。',
    tags: '标签', tagsPh: '用逗号分隔', fp: '指纹', regen: '重新生成', fpHint: '时区、语言和地理位置会跟随代理。',
    regenWarn: '网站会把它当成一台新设备，已登录的网站可能要求重新验证。', fpErr: '没能生成指纹。',
    firefoxMissing: '下载 Firefox 内核后才能生成这个指纹。', download: '下载', downloading: (pct: number) => `下载中… ${pct}%`,
    create: '创建环境', save: '保存修改', tz: '时区', lang: '语言', follow: '跟随代理', custom: '手动设置',
    tzPh: 'Europe/Berlin', langPh: 'de-DE', tzErr: '这台电脑不认识这个时区。', langErr: '请用 de-DE 这样的语言代码。',
    notes: '备注', engineVersion: '内核版本', owner: '负责人', department: '部门', noDepartment: '无部门',
    sync: '登录状态', syncCloud: '保存到 Folio，跟着环境走', syncLocal: '只存在使用它的电脑上',
    syncHelp: '只存本机时，登录状态不会离开那台电脑；在别的电脑上打开会是未登录状态。',
    stale: '你编辑期间别人改过这个环境。再次保存会覆盖他的修改，取消则保留他的修改。'
  },
  importer: {
    title: '导入环境', lead: '每行一个环境，第一行是表头。Excel 表格请先另存为 CSV；每次最多 500 行。',
    columns: '列：name 或 名称（必填）、group 分组、tags 标签（用 | 分隔）、os 系统（windows、macos、linux）、engine 内核（chromium、firefox）、proxy 代理、timezone 时区、language 语言、notes 备注、cookies（JSON 或 cookies.txt 文本）。',
    example: '填入示例', file: '选择文件…', pasteLabel: 'CSV', ready: (n: number) => `${n} 个环境可以导入。`,
    problems: '请先修正这些行：', row: (n: number) => `第 ${n} 行`, header: '第一行需要有「name」或「名称」列。',
    errs: { name: '名称为空或太长', os: '无法识别的系统', engine: '无法识别的内核', tags: '最多 10 个标签，每个不超过 24 个字', timezone: '无法识别的时区', language: '不是有效的语言代码', proxy: '代理地址无法识别', cookies: '读不出 Cookie', header: '' },
    tooMany: '每次最多 500 行。', room: (free: number) => `套餐还能放 ${free} 个环境。`, firefox: '有的行用了 Firefox，请先下载 Firefox 内核。',
    submit: (n: number) => `导入 ${n} 个环境`, steps: { proxies: '正在添加代理…', groups: '正在创建分组…', fingerprints: (i: number, n: number) => `正在生成指纹… ${i} / ${n}`, saving: '正在保存…', cookies: (i: number, n: number) => `正在导入 Cookie… ${i} / ${n}` },
    done: (n: number) => `已导入 ${n} 个环境`
  },
  proxies: {
    title: '代理', count: (n: number) => `${n} 个代理`, sub: (n: number, down: number) => `${n} 个代理${down ? ` · ${down} 个无响应` : ''}`,
    search: '搜索代理', searchPh: '搜索名称、主机或城市', add: '+ 添加代理', import: '导入', checkAll: '全部检测',
    cols: { proxy: '代理', exit: '出口', check: '最近检测', profiles: '环境数', backup: '备用线路' },
    never: '未检测', noResponse: (why: string) => `无响应${why === 'timeout' ? '（10 秒）' : ''}`, none: '—',
    empty: '还没有代理。添加一个，或导入代理商给你的列表。',
    bulkCheck: '检测', bulkDelete: '删除', confirmDelete: (n: number) => `删除 ${n} 个代理？`, confirmNote: '用到它们的环境会继续保留，改为不用代理。',
    deleted: (n: number) => `已删除 ${n} 个代理`, checked: (n: number) => `已检测 ${n} 个代理`, editX: (n: string) => `编辑 ${n}`, checkX: (n: string) => `检测 ${n}`,
    formAdd: '添加代理', formEdit: '编辑代理', name: '名称', namePh: '默认是 主机:端口', type: '类型', host: '主机', port: '端口',
    user: '用户名', pass: '密码', passKeep: '已保存，留空则不修改。', passRemove: '删除已保存的密码',
    backup: '备用线路', backupNone: '无', backupHint: '这条线路无响应时自动改用备用线路。',
    hostErr: '请填写主机名或 IP 地址。', portErr: '端口范围是 1 到 65535。',
    importTitle: '导入代理', importLead: '每行一个，支持这些格式：', defaultType: '没写类型的行按此类型',
    importBtn: '导入', imported: (added: number, known: number) => `新增 ${added} 个代理${known ? `，${known} 个已存在` : ''}`,
    badLines: '这些行无法识别：', line: (n: number) => `第 ${n} 行`
  },
  trash: {
    title: '回收站', sub: (n: number) => `${n} 个环境 · 不占套餐额度`, empty: '回收站是空的。',
    deleted: '删除时间', restore: '恢复', purge: '彻底删除', purgeAll: '清空回收站',
    confirmPurge: (n: number) => `彻底删除 ${n} 个环境？`, confirmNote: '它们的指纹和设置将无法找回。',
    restored: (n: number) => `已恢复 ${n} 个环境`, purged: (n: number) => `已彻底删除 ${n} 个环境`
  },
  engines: {
    title: '浏览器内核', lead: '每个环境会固定使用创建时的内核版本，在你决定升级之前，网站看到的它始终一样。',
    installed: '已下载', download: (size: string) => `下载 · ${size}`, usedBy: (n: number) => `${n} 个环境在用`, failed: '下载失败。', recommended: '新环境默认使用'
  },
  team: {
    title: '团队', sub: (n: number, seats: number | null) => `${n} 人${seats === null ? '' : ` · 套餐含 ${seats} 个席位`}`,
    invite: '+ 邀请', you: '你', remove: '移除', leave: '退出团队', removeX: (e: string) => `移除 ${e}`, roleOf: (e: string) => `${e} 的角色`,
    cols: { person: '成员', role: '角色', departments: '部门', profiles: '环境', joined: '加入时间' },
    roleHelp: { admin: '可以查看和管理所有环境、代理和成员。', member: '只看到并打开分配给自己的环境；可以新建和编辑，不能删除。' },
    pending: '待接受的邀请', invitedBy: (who: string) => `${who} 邀请`, expires: (date: string) => `${date} 过期`,
    copyLink: '复制链接', copied: '邀请链接已复制', resend: '重新发送', withdraw: '撤回', withdrawn: '邀请已撤回',
    inviteTitle: '邀请加入团队', email: '邮箱', emailErr: '请填写邮箱地址。', role: '角色', departments: '部门',
    send: '发送邀请', sent: (e: string) => `邀请已发送到 ${e}。`, notSent: '邮件没能发出，请复制链接自行发给对方。',
    link: '邀请链接', done: '完成',
    removeTitle: (e: string) => `移除 ${e}`, removeLead: '他名下的环境会交给你选定的人。他正在打开的环境会在他电脑上关闭，本机数据也会被删除。',
    heir: '把他的环境交给', removeDo: '移出团队', removed: (e: string) => `已移除 ${e}`,
    leaveTitle: (ws: string) => `退出「${ws}」？`, leaveLead: '你在这里的环境会交给所有者，你将无法再访问这个团队。', leaveDo: '退出',
    removedYou: (ws: string) => `你已不在「${ws}」中，它的环境已在这台电脑上关闭并删除。`,
    depts: '部门', deptAdd: '+ 部门', deptName: '部门名称', deptNone: '还没有部门。',
    deptHelp: '成员除了自己的环境，还能看到所在部门的环境。', deptCompany: '部门功能属于公司版。',
    deptMembers: '成员', deptDelete: '删除', deptDeleteConfirm: (n: string) => `删除「${n}」？它的环境会保留，变为无部门。`, deptProfiles: (n: number) => `${n} 个环境`,
    invites: '收到的邀请', join: '加入', decline: '拒绝', from: (who: string, role: string) => `${who} 邀请你成为${role}`
  },
  activity: {
    title: '操作日志', sub: (days: number) => `当前套餐保留 ${days} 天`, person: '成员', everyone: '所有人', kind: '显示',
    kinds: { all: '全部', open: '打开与关闭', profiles: '环境改动', trash: '回收站', proxies: '代理与分组', cookies: 'Cookie 与导出', team: '团队', automation: '自动化' },
    export: '导出 CSV', exported: (path: string) => `已保存到 ${path}`, more: '查看更早的', empty: '还没有记录。', someone: '有人', recent: '最近活动',
    today: '今天', yesterday: '昨天', on: (device: string) => `在 ${device} 上`,
    actions: {
      'profile.create': p => `创建了 ${p}`, 'profile.update': (p, x) => `修改了 ${p} 的${x.fields?.map((f: string) => zhFields[f] ?? f).join('、')}`,
      'profile.move': (p, x) => (x.group ? `把 ${p} 移到了「${x.group}」` : `把 ${p} 移出了分组`), 'profile.tag': (p, x) => `给 ${p} 加了标签「${x.tag}」`,
      'profile.untag': (p, x) => `去掉了 ${p} 的标签「${x.tag}」`, 'profile.set-proxy': (p, x) => (x.proxy ? `把 ${p} 的代理改成了 ${x.proxy}` : `去掉了 ${p} 的代理`),
      'profile.assign': (p, x) => (x.to ? `把 ${p} 分配给了 ${x.to}` : `取消了 ${p} 的负责人`), 'profile.set-department': (p, x) => (x.department ? `把 ${p} 划到了「${x.department}」` : `把 ${p} 移出了部门`),
      'profile.trash': p => `把 ${p} 移到了回收站`, 'profile.restore': p => `恢复了 ${p}`, 'profile.purge': p => `彻底删除了 ${p}`,
      'profile.open': (p, x) => (x.via === 'api' ? `通过 API 打开了 ${p}` : `打开了 ${p}`), 'profile.close': p => `关闭了 ${p}`, 'profile.takeover': (p, x) => `从 ${x.from ?? '另一台电脑'} 收回了 ${p}`,
      'proxy.create': (_p, x) => `添加了代理 ${x.name}`, 'proxy.import': (_p, x) => `导入了 ${x.added} 个代理`,
      'proxy.update': (_p, x) => `修改了代理 ${x.name}`, 'proxy.delete': (_p, x) => `删除了代理 ${x.name}`,
      'group.create': (_p, x) => `创建了分组「${x.name}」`, 'group.rename': (_p, x) => `把分组「${x.from}」改名为「${x.name}」`, 'group.delete': (_p, x) => `删除了分组「${x.name}」`,
      'member.invite': (_p, x) => `邀请 ${x.email} 成为${zhRoles[x.role]}`, 'member.join': (_p, x) => `以${zhRoles[x.role]}身份加入`,
      'member.role': (_p, x) => `把 ${x.email} 设为${zhRoles[x.role]}`, 'member.remove': (_p, x) => `移除了 ${x.email}，其环境交给了 ${x.to}`,
      'member.leave': () => '退出了团队', 'invitation.withdraw': (_p, x) => `撤回了给 ${x.email} 的邀请`,
      'department.create': (_p, x) => `创建了部门「${x.name}」`, 'department.update': (_p, x) => (x.from ? `把部门「${x.from}」改名为「${x.name}」` : `调整了「${x.name}」的成员`),
      'department.delete': (_p, x) => `删除了部门「${x.name}」`,
      'cookies.export': (p, x) => `导出了 ${p} 的 ${x.count} 个 Cookie`, 'cookies.import': (p, x) => `向 ${p} 导入了 ${x.count} 个 Cookie`,
      'workspace.export': (_p, x) => `导出了全部数据（${x.profiles} 个环境、${x.proxies} 个代理）`,
      'workspace.import': (_p, x) => `导入了 ${x.profiles} 个环境，新增 ${x.proxies} 个代理和 ${x.groups} 个分组`,
      'flow.create': (_p, x) => `新建了流程 ${x.name}`, 'flow.update': (_p, x) => (x.from ? `把流程 ${x.from} 改名为 ${x.name}` : `修改了流程 ${x.name}`),
      'flow.delete': (_p, x) => `删除了流程 ${x.name}`,
      'task.create': (_p, x) => `新建了任务 ${x.name}`, 'task.update': (_p, x) => (x.from ? `把任务 ${x.from} 改名为 ${x.name}` : `修改了任务 ${x.name}`),
      'task.delete': (_p, x) => `删除了任务 ${x.name}`, 'run.start': (_p, x) => `${x.trigger === 'rerun' ? '重跑' : '运行'}了任务 ${x.name}，共 ${x.profiles} 个环境`,
      'run.finish': (_p, x) => `任务 ${x.name} ${x.status === 'stopped' ? '已停止' : '跑完了'}：${x.ok} 个成功，${x.failed} 个失败${x.signedOut ? `，${x.signedOut} 个掉线` : ''}${x.skipped ? `，${x.skipped} 个没跑` : ''}`
    }
  },
  transfer: {
    exportTitle: '导出全部数据', exportLead: '一个文件里包含所有环境（指纹和设置）、它们的登录状态、分组，以及带密码的代理。回收站里的环境不导出。',
    passphrase: '口令', confirm: '再输一次口令', passHelp: '至少 10 位。文件只能用它打开，口令不会保存在任何地方：忘了口令，文件也就打不开了。',
    passShort: '口令至少 10 位。', passMismatch: '两次输入的口令不一致。', export: '导出', exporting: '正在导出…', exported: (path: string) => `已保存到 ${path}`,
    importTitle: '导入数据', importLead: '把 .folio 文件导入到当前团队：环境会新增并重新编号，相同的代理和同名分组会复用。',
    choose: '选择 .folio 文件…', unlock: '解锁', unlocking: '正在解锁…',
    preview: (p: { workspace: string; profiles: number; proxies: number; groups: number; signedIn: number }) => `来自「${p.workspace}」：${p.profiles} 个环境（${p.signedIn} 个带登录状态）、${p.proxies} 个代理、${p.groups} 个分组。`,
    room: (free: number) => `套餐还能放 ${free} 个环境。`, import: '导入', importing: '正在导入…',
    imported: (r: { profiles: number; proxies: number; groups: number; signedIn: number }) => `已导入 ${r.profiles} 个环境（${r.signedIn} 个带登录状态），新增 ${r.proxies} 个代理、${r.groups} 个分组`
  },
  flows: {
    title: '流程', sub: (n: number) => `${n} 个流程 · 团队共享`, new: '+ 新建流程',
    template: '登录检查模板', templateName: '登录检查',
    cols: { name: '流程', steps: '步骤', by: '创建人', updated: '修改时间' },
    empty: '还没有流程。流程是一串步骤（打开网页、点击、输入、提取……），可以在一个或多个环境上运行。',
    you: '我', view: '查看', duplicate: '复制', duplicateToEdit: '复制一份再修改', delete: '删除', deleteX: (n: string) => `删除 ${n}`,
    inUse: (tasks: string) => `被 ${tasks} 使用，不能删除。`, confirmDelete: (n: string) => `删除「${n}」？`, deleted: (n: string) => `已删除 ${n}`, copyName: (n: string) => `${n}（副本）`, untitled: '新流程',
    back: '← 流程', name: '流程名称', save: '保存', saving: '正在保存…', saved: '流程已保存',
    leave: '修改还没保存，确定离开吗？', keepEditing: '继续编辑', discard: '放弃修改',
    readOnly: '只有这个流程的创建者、管理员和所有者能修改。可以复制一份，改成你自己的版本。',
    stale: '你编辑期间，别人保存过这个流程。再点一次保存，会用你的版本覆盖对方的。',
    issues: (n: number) => `还有 ${n} 个步骤没填好，填好后才能保存。`,
    steps: '步骤', noSteps: '添加第一个步骤。', add: '+ 添加步骤',
    types: { open: '打开网址', click: '点击', type: '输入', press: '按键', wait: '等待', scroll: '滚动', extract: '提取', set: '设置变量', if: '条件判断', loop: '循环', screenshot: '截图', script: '执行脚本', signedIn: '确认已登录' } satisfies Record<Step['type'], string>,
    up: (p: string) => `第 ${p} 步上移`, down: (p: string) => `第 ${p} 步下移`, copyStep: (p: string) => `复制第 ${p} 步`, remove: (p: string) => `删除第 ${p} 步`,
    then: '满足时', else: '否则', each: '每一次',
    issue: { url: '填写要打开的网址。', selector: '指定是哪个元素。', key: '填写按键。', variable: '变量名只能用字母、数字和下划线，不能以数字开头。', pixels: '填写滚动的距离。', times: '至少重复一次。', code: '填写脚本。', attribute: '填写属性名。' },
    f: {
      selector: '元素', selectorPh: '#login、.price、text=登录', variable: '变量', url: '网址', text: '文字', slow: '逐字输入，像人一样打字',
      key: '按键', until: '等待', untilTime: '一段时间', untilVisible: '元素出现', untilHidden: '元素消失',
      seconds: '秒数', maxSeconds: '最多（随机）', optional: '可不填', limit: '最多等（秒）',
      to: '滚动', toElement: '滚到元素', toPixels: '滚动若干像素', toBottom: '滚到底', pixels: '像素（负数向上）',
      take: '取', takeText: '文字', takeAttr: '属性', attribute: '属性名', into: '存入变量', value: '值',
      shot: '截取', shotPage: '整页', shotElement: '某个元素', code: 'JavaScript', result: '返回值存入',
      scriptHint: '在网页里执行；用 return 返回结果。Firefox 环境里，脚本默认读不到网页自己的 JavaScript 变量，需要的话在开头加 mw:。',
      test: '条件', exists: '某个元素存在', contains: '某个元素的文字包含', equals: '某个变量等于',
      repeat: '重复', repeatTimes: '固定次数', repeatEach: '对每个匹配的元素', times: '次数',
      eachHint: '里面的步骤可以用 @item 指代当前元素（@item >> a 表示在它里面找），{{loop.index}} 从 1 开始计数。', timesHint: '里面的步骤可以用 {{loop.index}}，从 1 开始计数。',
      signedBy: '算已登录的条件', signedPresent: '看到这个元素', signedAbsent: '看不到这个元素',
      signedHint: '比如只有登录后才有的头像、账户菜单，或者只有没登录时才有的「登录」按钮。判断为掉线时，这个环境到此为止；在任务里运行时会发桌面通知。'
    },
    trial: {
      title: '试运行', lead: '用编辑器里当前的步骤（不必先保存），在环境的新标签页里跑一遍。跑完浏览器保持打开。',
      profile: '在哪个环境上跑', noProfiles: '还没有环境', vars: '这次运行用的变量（名称=值，每行一个）', run: '运行', stop: '停止', log: '日志',
      ms: (n: number) => (n < 1000 ? `${n} 毫秒` : `${(n / 1000).toFixed(1)} 秒`), times: (n: number) => `${n} 次`,
      ok: '跑完了。', signedOut: '检查发现这个环境已经掉线了。', notOpened: (why: string) => `环境没有打开：${why}`, failed: (why: string) => `在出错的一步停下了：${why}`, shot: (name: string) => `查看 ${name}`
    },
    errors: {
      timeout: '超时：元素没有出现，或者网页没有加载完。', navigation: '网页打不开。', script: '脚本出错了。',
      variable: (name: string) => `{{${name}}} 没有值。`, no_item: '@item 只能用在「对每个匹配的元素」循环里。',
      closed: '浏览器或标签页被关掉了。', stopped: '已停止。', failed: '这一步失败了。',
      too_long: (min: string) => `超过了任务设定的 ${min} 分钟。`, signed_out: '已掉线。'
    }
  },
  tasks: {
    title: '定时任务', sub: (n: number) => `${n} 个任务`, new: '+ 新建任务', needFlow: '先在「流程」页建一个流程。',
    empty: '还没有任务。任务会把一个流程放到一组环境上运行，几个几个地跑，并保留每次运行的结果。',
    cols: { task: '任务', profiles: '环境', when: '时间', last: '上次运行', by: '创建人', profile: '环境', status: '结果', attempts: '尝试', time: '用时', result: '详情' },
    never: '还没运行过', manual: '手动', next: (at: string) => `下次：${at}`, done: '时间已过', on: (device: string) => `在 ${device} 上运行`,
    once: (at: string) => `一次：${at}`, everyDay: '每天', weekdays: '工作日', weekends: '周末', dayNames: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    onlyOpen: '定时任务在它所属的电脑上运行，前提是那台电脑上 Folio 开着并已登录；错过的时间会记下来，不会事后补跑。', enableStartup: '开机自动启动 Folio',
    run: '运行', runX: (n: string) => `运行 ${n}`, stop: '停止', delete: '删除', deleteX: (n: string) => `删除 ${n}`,
    confirmDelete: (n: string) => `删除「${n}」及其运行记录？`, deleted: (n: string) => `已删除 ${n}`, started: (n: string) => `${n} 已在这台电脑上开始运行`,
    saved: '任务已保存', stale: '你编辑期间别人改过这个任务。请重新打开再改一次。',
    status: { running: '运行中', done: '已完成', stopped: '已停止', interrupted: '已中断', missed: '错过', busy: '跳过' },
    progress: (done: number, all: number) => `已完成 ${done} / ${all}`, elsewhere: (where: string) => `在 ${where} 上`,
    counts: (c: { ok: number; failed: number; signed_out: number; skipped: number; canceled: number }) => [c.ok && `${c.ok} 个成功`, c.signed_out && `${c.signed_out} 个掉线`, c.failed && `${c.failed} 个失败`, c.skipped && `${c.skipped} 个跳过`, c.canceled && `${c.canceled} 个没跑`].filter(Boolean).join(' · ') || '一个也没跑',
    back: '← 任务', about: (flow: string, n: number, conc: number, retries: number) => `${flow} · ${n} 个环境 · 同时 ${conc} 个 · ${retries === 0 ? '不重试' : `失败重试 ${retries} 次`}`,
    runs: '运行记录', noRuns: '还没有运行记录。', triggers: { manual: '手动', rerun: '重跑', schedule: '定时' }, result: '运行结果',
    missedNote: (at: string, device: string) => `${at} 这次没有运行：${device || '它所属的电脑'}上 Folio 没开着或没登录，或者电脑在睡眠。`,
    busyNote: (at: string) => `${at} 这次没有运行：上一轮还没跑完。`, runNow: '补跑',
    startedBy: (who: string, device: string | null, when: string) => `${who}${device ? `，在 ${device} 上` : ''}，${when}`,
    rerun: (n: number) => `重跑没成功的 ${n} 个`, export: '导出 CSV', exported: (path: string) => `已保存到 ${path}`,
    csv: { number: '编号', profile: '环境', status: '结果', attempts: '尝试次数', problem: '问题' },
    item: { pending: '等待中', running: '运行中', ok: '成功', failed: '失败', signed_out: '已掉线', skipped: '跳过', canceled: '没跑' },
    noLog: '没有日志。', attempt: (n: number) => `第 ${n} 次尝试`, shotsWhere: (device: string) => (device ? `截图存在 ${device} 上。` : '截图存在运行它的电脑上。'),
    skip: { locked: '正在另一台电脑上使用。', not_found: '这个环境已经不存在了。', in_trash: '这个环境在回收站里。', forbidden: '这个环境已经不归你了。', scripted: '当时正由脚本通过本机 API 控制。' } as Record<string, string>,
    form: {
      newTitle: '新建任务', editTitle: '编辑任务', create: '创建任务', save: '保存修改', name: '名称', flow: '流程',
      profiles: (n: number) => `环境 · 已选 ${n} 个`, search: '搜索环境', all: '全选筛出的', none: '没有匹配的环境。',
      concurrency: '同时运行', retries: '失败时', retriesN: (n: number) => (n === 0 ? '不重试' : `最多重试 ${n} 次`),
      timeout: '每个环境最长', minutes: (n: number) => `${n} 分钟`,
      memory: '每个打开的环境大约占 300 到 500 MB 内存，同时运行几个请按电脑配置来设。',
      when: '何时运行', kinds: { none: '手动', once: '一次', daily: '每天' }, at: '日期和时间', time: '时间', days: '星期',
      runsHere: '在这台电脑上运行，按这台电脑的时间。', runsOn: (device: string, email: string) => `在 ${device}（${email}）上运行，按那台电脑的时间。`,
      moveHere: '改到这台电脑上运行', scheduleHelp: '那台电脑上 Folio 要开着并已登录；错过的时间会记下来，可以从记录里补跑。',
      vars: '按环境设置的变量', varsHelp: '可不填。上传一个表格：第一列是环境（名称或编号），其余每列是一个变量，在流程里写成 {{列名}}。加密保存，只有能编辑这个任务的人看得到。',
      varsStored: (n: number, names: string) => `已为 ${n} 个环境设置：${names}`, varsCleared: '保存后会删除这些变量。',
      varsReplace: '重新导入…', varsClear: '删除', varsKeep: '保留现有的',
      varsReady: (n: number, names: string) => `${n} 个环境的 ${names}。`,
      varErrs: { header: '第一行要有环境列和至少一个变量', variable: '变量名只能用字母、数字和下划线', profile: '不是上面选中的环境', repeat: '这个环境在前面的行里已经出现过' }
    }
  },
  apiPage: {
    title: 'API 与脚本', sub: '让这台电脑上的脚本打开环境，并用 Playwright、Puppeteer 或 Selenium 接管。', reference: 'API 参考',
    server: '本机 API', enable: '开启', listening: '正在监听', off: '已关闭。开启后，这台电脑上的脚本才能使用。', copy: '复制', copied: '已复制',
    errors: { port_in_use: '这个端口被别的程序占用了，请换一个。', listen_failed: '在这个端口上启动失败，请换一个。' },
    port: '端口', limit: '每分钟最多 60 次请求（打开、关闭、查询）。脚本直接发给浏览器的指令不计入。公司版不限速。',
    unthrottled: '公司版：请求不限速。',
    security: '调试地址没有密码：通过 API 打开的环境运行期间，这台电脑上的任何程序都能控制它。你自己手动打开的环境不开调试地址。',
    tokens: '令牌', tokensHelp: '脚本在请求头里带上 Authorization: Bearer <令牌>。令牌属于你和这个团队，只在这台电脑上有效，权限和你相同。',
    newToken: '请现在复制这个令牌，它不会再显示。', done: '好了', tokenName: '名称，比如订单同步', createToken: '生成令牌', defaultName: '令牌',
    made: (date: string) => `${date} 生成`, used: (date: string) => `最后使用于 ${date}`, unused: '还没用过', revoke: '作废', revokeX: (n: string) => `作废 ${n}`, otherWorkspace: '另一个团队',
    examples: '示例', exampleNames: { playwright: 'Playwright', puppeteer: 'Puppeteer', selenium: 'Selenium', firefox: 'Firefox 环境' },
    chromiumNote: 'Chromium 环境返回 CDP 地址：Playwright、Puppeteer、Selenium（配合对应 Chromium 150 的 chromedriver）或任何支持 CDP 的工具都能接管。',
    firefoxNote: 'Firefox 环境返回 WebDriver BiDi 地址：Puppeteer 或其他支持 WebDriver BiDi 的工具能接管。Playwright 和 Selenium 目前不能接管已在运行的 Firefox。脚本控制期间，任务会跳过它。',
    endpoints: '接口',
    routes: [
      ['GET /api/v1/profiles', '你能看到的环境，以及是否在运行'], ['POST /api/v1/profiles/{编号}/start', '打开环境，返回调试地址'],
      ['GET /api/v1/profiles/{编号}', '是否在运行；通过 API 打开的附带调试地址'], ['POST /api/v1/profiles/{编号}/stop', '关闭环境，照常保存登录状态'],
      ['GET /api/v1/tasks', '团队的任务'], ['POST /api/v1/tasks/{id}/run', '在这台电脑上运行一个任务'], ['GET /api/v1/runs/{id}', '运行进度，按环境列出']
    ] as [string, string][]
  },
  onboarding: {
    head: 'FOLIO · GETTING STARTED', title: '三分钟配好第一个环境', hide: '隐藏',
    proxy: '添加代理', proxyD: '常见格式直接粘贴即可。', profile: '新建环境', profileD: '选好系统，指纹会自动生成。',
    open: '打开它', openD: '浏览器会用代理所在地的时区和语言启动。', done: '已完成'
  },
  loading: '加载中…', retry: '重试',
  errors: {
    invalid_credentials: '邮箱或密码不对。',
    unauthenticated: '登录已过期，请重新登录。',
    rate_limited: '操作太频繁，请等一分钟再试。',
    validation: '请填写邮箱和密码。',
    network: '连不上 Folio，请检查网络后重试。',
    internal: '我们这边出了点问题，请重试。',
    plan_limit: '套餐额度已满。把一些环境移到回收站，或给套餐增加环境。',
    group_exists: '已经有同名的分组了。',
    bad_reference: '这个分组、代理或成员已经不在团队里了，请换一个。',
    forbidden: '你的角色没有这个权限，请联系所有者或管理员。',
    seat_limit: '套餐没有空余席位了，升级后才能邀请更多人。',
    already_member: '这个人已经在团队里了。',
    department_exists: '已经有同名的部门了。',
    plan_required: '部门功能属于公司版。',
    owner: '所有者始终在团队中，角色不能更改。',
    wrong_account: '这个邀请是发给另一个邮箱的。',
    email_unverified: '请先在 Folio 官网验证邮箱。',
    invitation_expired: '这个邀请已过期，请让对方重新邀请。',
    local_only: '这个环境的登录状态只存在使用它的电脑上，请在那台电脑上打开后再导出或导入 Cookie。',
    cookies_unreadable: '文件里没有找到 Cookie。请使用 JSON（Cookie-Editor、EditThisCookie）或 cookies.txt。',
    locked: '这个环境正在另一台电脑上使用。',
    not_found: '这个环境还没有保存过登录状态。',
    wrong_passphrase: '口令不对，打不开这个文件。',
    not_folio: '这不是 Folio 导出的文件。',
    passphrase_short: '口令至少 10 位。',
    flow_too_deep: '步骤最多嵌套四层。',
    flow_too_long: '一个流程最多 300 个步骤。',
    flow_in_use: '有任务在用这个流程，先删除这些任务或让它们改用别的流程。',
    task_running: '这个任务正在运行。',
    no_profiles: '这个任务的环境都不能运行（已删除、在回收站里，或者不归你）。',
    run_finished: '这次运行已经结束了。',
    no_device: '请先在这个工作台里退出并重新登录一次，再在这台电脑上设定时任务。',
    already_run: '这个时间已经运行过了。'
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
export function runTime(ms: number){
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}
export const errorText = (d: Dict, code: string) => d.errors[code] ?? d.errors.internal;
