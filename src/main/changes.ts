// Listens to the server's change stream for the open workspace and passes events to the renderer.
// Reconnects with a growing delay when the connection drops.
import { net } from 'electron';
import { API_URL } from './api';
import { getToken } from './session';
import type { Change } from '../shared/bridge';

let current: { workspaceId: string; abort: AbortController } | null = null;

export function watch(workspaceId: string | null, emit: (c: Change) => void){
  if (current?.workspaceId === workspaceId) return;
  current?.abort.abort();
  current = null;
  if (!workspaceId) return;
  const abort = new AbortController();
  current = { workspaceId, abort };
  void loop(workspaceId, abort.signal, emit);
}

async function loop(workspaceId: string, signal: AbortSignal, emit: (c: Change) => void){
  let delay = 1000;
  while (!signal.aborted){
    try {
      const res = await net.fetch(`${API_URL}/workspaces/${workspaceId}/events`, { headers: { authorization: `Bearer ${getToken()}`, accept: 'text/event-stream' }, signal });
      if (res.ok && res.body){
        delay = 1000;
        // Something may have changed while we were disconnected.
        emit({ kind: 'workspace' }); emit({ kind: 'profiles' }); emit({ kind: 'proxies' }); emit({ kind: 'groups' }); emit({ kind: 'flows' }); emit({ kind: 'tasks' }); emit({ kind: 'runs' }); emit({ kind: 'extensions' });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;){
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0){
            const frame = buf.slice(0, i); buf = buf.slice(i + 2);
            const data = frame.split('\n').find(l => l.startsWith('data: '));
            if (frame.includes('event: change') && data) emit(JSON.parse(data.slice(6)) as Change);
          }
        }
      }
    } catch { /* dropped; retry below */ }
    if (signal.aborted) return;
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30_000);
  }
}
