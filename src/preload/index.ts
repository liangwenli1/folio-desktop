import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ApiResult, FolioBridge } from '../shared/bridge';

// Failures reach the renderer as plain { code, message, status } objects, which survive the context bridge.
async function unwrap<T>(p: Promise<ApiResult<T>>){
  const r = await p;
  if (!r.ok) throw r.error;
  return r.data;
}

function listen<T>(channel: string, cb: (payload: T) => void){
  const handler = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.off(channel, handler); };
}

const bridge: FolioBridge = {
  login: (email, password) => unwrap(ipcRenderer.invoke('folio:login', email, password)),
  logout: () => unwrap(ipcRenderer.invoke('folio:logout')),
  hasSession: () => ipcRenderer.invoke('folio:hasSession'),
  api: (method, path, body) => unwrap(ipcRenderer.invoke('folio:api', method, path, body)),
  openSite: path => ipcRenderer.invoke('folio:openSite', path),
  saveFile: (name, content) => ipcRenderer.invoke('folio:saveFile', name, content),
  exportCookies: (profiles, format) => ipcRenderer.invoke('folio:exportCookies', profiles, format),
  importCookies: (id, text) => unwrap(ipcRenderer.invoke('folio:importCookies', id, text)),
  exportWorkspace: (workspaceId, passphrase) => unwrap(ipcRenderer.invoke('folio:exportWorkspace', workspaceId, passphrase)),
  pickImport: () => ipcRenderer.invoke('folio:pickImport'),
  unlockImport: (token, passphrase) => unwrap(ipcRenderer.invoke('folio:unlockImport', token, passphrase)),
  runImport: (token, workspaceId) => unwrap(ipcRenderer.invoke('folio:runImport', token, workspaceId)),
  info: () => ipcRenderer.invoke('folio:info'),
  onFocus: cb => listen('app:focus', cb),

  watch: workspaceId => ipcRenderer.invoke('folio:watch', workspaceId),
  onChange: cb => listen('app:change', cb),

  openProfile: id => ipcRenderer.invoke('folio:openProfile', id),
  stopProfile: id => ipcRenderer.invoke('folio:stopProfile', id),
  focusProfile: id => ipcRenderer.invoke('folio:focusProfile', id),
  checkup: id => ipcRenderer.invoke('folio:checkup', id).then((r: { ok: boolean; facts?: unknown; exitIp?: string | null; exitGeo?: unknown; error?: string }) => { if (!r.ok) throw { code: r.error, message: r.error, status: 0 }; return { facts: r.facts, exitIp: r.exitIp ?? null, exitGeo: r.exitGeo ?? null } as never; }),
  statuses: () => ipcRenderer.invoke('folio:statuses'),
  onStatus: cb => listen('profile:status', cb),

  tryFlow: (profileId, steps, vars) => ipcRenderer.invoke('folio:tryFlow', profileId, steps, vars),
  stopFlow: token => ipcRenderer.invoke('folio:stopFlow', token),
  onFlow: cb => listen('flow:event', cb),
  runTask: (taskId, trigger, profileIds) => unwrap(ipcRenderer.invoke('folio:runTask', taskId, trigger, profileIds)),
  stopRun: runId => ipcRenderer.invoke('folio:stopRun', runId),
  activeRuns: () => ipcRenderer.invoke('folio:activeRuns'),
  onRuns: cb => listen('runs:active', cb),
  onSignedOut: cb => listen('runs:signed-out', cb),
  update: () => ipcRenderer.invoke('folio:update'),
  onUpdate: cb => listen('app:update', cb),
  installUpdate: () => ipcRenderer.invoke('folio:installUpdate'),
  startup: () => ipcRenderer.invoke('folio:startup'),
  setStartup: on => ipcRenderer.invoke('folio:setStartup', on),
  setLabels: labels => ipcRenderer.invoke('folio:setLabels', labels),
  startWindowSync: (ids, leader) => ipcRenderer.invoke('folio:startWindowSync', ids, leader),
  stopWindowSync: () => ipcRenderer.invoke('folio:stopWindowSync'),
  setSyncLeader: id => ipcRenderer.invoke('folio:setSyncLeader', id),
  syncGoto: url => ipcRenderer.invoke('folio:syncGoto', url),
  tileWindows: () => ipcRenderer.invoke('folio:tileWindows'),
  windowSync: () => ipcRenderer.invoke('folio:windowSync'),
  onWindowSync: cb => listen('sync:state', cb),
  syncOptions: () => ipcRenderer.invoke('folio:syncOptions'),
  setSyncOptions: change => ipcRenderer.invoke('folio:setSyncOptions', change),
  syncLog: () => ipcRenderer.invoke('folio:syncLog'),
  onSyncLog: cb => listen('sync:log', cb),
  watchSyncThumbs: on => ipcRenderer.invoke('folio:watchSyncThumbs', on),
  onSyncThumbs: cb => listen('sync:thumbs', cb),
  localApi: () => ipcRenderer.invoke('folio:localApi'),
  setLocalApi: change => ipcRenderer.invoke('folio:setLocalApi', change),
  createApiToken: (name, workspaceId) => ipcRenderer.invoke('folio:createApiToken', name, workspaceId),
  revokeApiToken: id => ipcRenderer.invoke('folio:revokeApiToken', id),
  onLocalApi: cb => listen('api:state', cb),
  showWindow: () => ipcRenderer.invoke('folio:showWindow'),
  addExtension: (workspaceId, kernel, from) => unwrap(ipcRenderer.invoke('folio:addExtension', workspaceId, kernel, from)),
  updateExtension: (id, kernel, from) => unwrap(ipcRenderer.invoke('folio:updateExtension', id, kernel, from)),
  showFile: path => ipcRenderer.invoke('folio:showFile', path),

  checkProxy: id => ipcRenderer.invoke('folio:checkProxy', id),
  tryProxy: draft => ipcRenderer.invoke('folio:tryProxy', draft),
  newFingerprint: (kind, os, version, ask) => unwrap(ipcRenderer.invoke('folio:newFingerprint', kind, os, version, ask)),
  firefoxGpus: os => ipcRenderer.invoke('folio:firefoxGpus', os),
  kernels: () => ipcRenderer.invoke('folio:kernels'),
  installKernel: (kind, version) => ipcRenderer.invoke('folio:installKernel', kind, version),
  removeKernel: (kind, version) => ipcRenderer.invoke('folio:removeKernel', kind, version),
  pauseKernel: (kind, version) => ipcRenderer.invoke('folio:pauseKernel', kind, version),
  kernelUsage: () => ipcRenderer.invoke('folio:kernelUsage'),
  kernelSettings: () => ipcRenderer.invoke('folio:kernelSettings'),
  setKernelSettings: change => ipcRenderer.invoke('folio:setKernelSettings', change),
  onKernelProgress: cb => listen('kernel:progress', cb),
  pickKernelFile: () => ipcRenderer.invoke('folio:pickKernelFile'),
  uploadKernel: (token, meta) => unwrap(ipcRenderer.invoke('folio:uploadKernel', token, meta)),
  onKernelUpload: cb => listen('kernel:upload', cb)
};

contextBridge.exposeInMainWorld('folio', bridge);
