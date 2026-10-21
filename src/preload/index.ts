import { contextBridge, ipcRenderer } from 'electron';
import type { ApiResult, FolioBridge } from '../shared/bridge';

// Failures reach the renderer as plain { code, message, status } objects, which survive the context bridge.
async function unwrap<T>(p: Promise<ApiResult<T>>){
  const r = await p;
  if (!r.ok) throw r.error;
  return r.data;
}

const bridge: FolioBridge = {
  login: (email, password) => unwrap(ipcRenderer.invoke('folio:login', email, password)),
  logout: () => unwrap(ipcRenderer.invoke('folio:logout')),
  hasSession: () => ipcRenderer.invoke('folio:hasSession'),
  api: (method, path, body) => unwrap(ipcRenderer.invoke('folio:api', method, path, body)),
  openSite: path => ipcRenderer.invoke('folio:openSite', path),
  info: () => ipcRenderer.invoke('folio:info'),
  onFocus(cb){
    const handler = () => cb();
    ipcRenderer.on('app:focus', handler);
    return () => { ipcRenderer.off('app:focus', handler); };
  }
};

contextBridge.exposeInMainWorld('folio', bridge);
