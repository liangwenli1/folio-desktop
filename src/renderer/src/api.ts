import type { paths } from '@shared/api-schema';
import type { ApiErrorBody, FolioBridge } from '@shared/bridge';

declare global { interface Window { folio: FolioBridge } }
export const folio = window.folio;

type Ok<P extends keyof paths, M extends 'get' | 'post' | 'patch'> =
  paths[P][M] extends { responses: { 200: { content: { 'application/json': infer T } } } } ? T : never;

export type Me = Ok<'/me', 'get'>;
export type WorkspaceSummary = Me['workspaces'][number];
export type Workspace = Ok<'/workspaces/{id}', 'get'>;
export type Subscription = Workspace['subscription'];
export type Profile = Ok<'/workspaces/{id}/profiles', 'get'>['profiles'][number];
export type Group = Ok<'/workspaces/{id}/groups', 'get'>['groups'][number];
// The groups each under its parent, outermost first, with how deep each sits and its full path ("US sites / Los
// Angeles"); one whose parent isn't visible here starts a tree of its own.
export function groupTree(groups: Group[]){
  const ids = new Set(groups.map(g => g.id)), kids = new Map<string | null, Group[]>();
  for (const g of groups){ const up = g.parentId && ids.has(g.parentId) ? g.parentId : null; kids.set(up, [...(kids.get(up) ?? []), g]); }
  const out: { group: Group; depth: number; path: string }[] = [];
  const walk = (up: string | null, depth: number, path: string) => {
    for (const g of kids.get(up) ?? []){ const at = path ? `${path} / ${g.name}` : g.name; out.push({ group: g, depth, path: at }); walk(g.id, depth + 1, at); }
  };
  walk(null, 0, '');
  return out;
}
// A group with the ones above it, outermost first (v2 04): "Cross-border / US sites".
export function groupPath(groups: Group[], g: Group){
  const names = [g.name];
  for (let up = groups.find(x => x.id === g.parentId); up && names.length < 10; up = groups.find(x => x.id === up!.parentId)) names.unshift(up.name);
  return names.join(' / ');
}
export type Proxy = Ok<'/workspaces/{id}/proxies', 'get'>['proxies'][number];
export type ProxyImport = Ok<'/workspaces/{id}/proxies/import', 'post'>;
export type ImportLine = Ok<'/workspaces/{id}/proxies/import/preview', 'post'>['lines'][number];
export type Geo = NonNullable<NonNullable<Proxy['lastCheck']>['geo']>;
export type MyRole = Workspace['role'];
export type Permission = MyRole['permissions'][number];
export type Role = Ok<'/workspaces/{id}/roles', 'get'>['roles'][number];
// What the person may do here. Administering the workspace — members, roles, settings, the extension library,
// the subscription — goes with being able to manage members.
export const can = (role: MyRole, p: Permission) => role.permissions.includes(p);
export const MANAGE = 'team.manage' as const;
export type Member = Ok<'/workspaces/{id}/members', 'get'>['members'][number];
export type Invitation = Ok<'/workspaces/{id}/invitations', 'get'>['invitations'][number];
export type MyInvitation = Ok<'/me/invitations', 'get'>['invitations'][number];
export type ActivityEntry = Ok<'/workspaces/{id}/activity', 'get'>['entries'][number];
export type ActivityAction = ActivityEntry['action'];
export type Flow = Ok<'/workspaces/{id}/flows', 'get'>['flows'][number];
export type Task = Ok<'/workspaces/{id}/tasks', 'get'>['tasks'][number];
export type Run = Ok<'/workspaces/{id}/runs', 'get'>['runs'][number];
export type RunItem = Ok<'/runs/{id}', 'get'>['items'][number];
export type Extension = Ok<'/workspaces/{id}/extensions', 'get'>['extensions'][number];
export type Kernel = Ok<'/kernels', 'get'>['kernels'][number];
export type Payment = Ok<'/workspaces/{id}/payments', 'get'>['payments'][number];
export type Job = Ok<'/workspaces/{id}/jobs', 'get'>['jobs'][number];
export type JobKind = Job['kind'];
export type JobDetail = Ok<'/jobs/{id}', 'get'>;
export type JobItem = JobDetail['items'][number];

export const isApiError = (e: unknown): e is ApiErrorBody => typeof e === 'object' && e !== null && 'code' in e && 'status' in e;
