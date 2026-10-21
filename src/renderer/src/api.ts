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

export const isApiError = (e: unknown): e is ApiErrorBody => typeof e === 'object' && e !== null && 'code' in e && 'status' in e;
