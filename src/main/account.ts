// Who is logged in on this computer. Profile folders live under the account's id, so two accounts on one
// computer never share one, and a workspace's folders can be found when the account leaves it.
import { api } from './api';

interface Me { id: string; workspaceIds: string[] }
let cached: Promise<Me | null> | null = null;

export function me(refresh = false){
  if (refresh || !cached){
    cached = api<{ user: { id: string }; workspaces: { id: string }[] }>('GET', '/me')
      .then(r => (r.ok ? { id: r.data.user.id, workspaceIds: r.data.workspaces.map(w => w.id) } : null));
  }
  return cached;
}
export const forget = () => { cached = null; };
