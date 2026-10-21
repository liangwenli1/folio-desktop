import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, request, type ElectronApplication } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://localhost:47110';
export const SITE = 'http://localhost:47120';
export const PASSWORD = 'correct horse battery';
let n = 0;

// Creates an account the way the website does: register, verify, and optionally buy a plan.
export async function account({ locale = 'en', buy }: { locale?: 'en' | 'zh'; buy?: { plan: string; period: string } } = {}){
  const email = `desk${Date.now().toString(36)}${n++}@example.com`;
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { origin: SITE } });
  await api.post('/auth/register', { data: { email, password: PASSWORD, locale } });
  const { code } = await (await api.get(`/dev/mail?email=${encodeURIComponent(email)}`)).json();
  await api.post('/auth/verify-email', { data: { code } });
  const me = await (await api.get('/me')).json();
  const workspaceId = me.workspaces[0].id as string;
  if (buy){
    const { checkoutId } = await (await api.post(`/workspaces/${workspaceId}/billing/checkout`, { data: { ...buy, addonPacks: 0 } })).json();
    await api.post(`/billing/checkouts/${checkoutId}/pay`, { data: { card: { number: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' } } });
  }
  return { email, workspaceId, api };
}

export const dataDir = () => mkdtempSync(join(tmpdir(), 'folio-'));

export function launch(userData: string, env: Record<string, string> = {}){
  return electron.launch({
    args: ['out/main/index.js', '--no-sandbox'],
    env: { ...process.env, FOLIO_API_URL: API, FOLIO_SITE_URL: SITE, FOLIO_PASSWORD_STORE: 'basic', FOLIO_USER_DATA: userData, ...env }
  });
}

export async function logIn(app: ElectronApplication, email: string){
  const win = await app.firstWindow();
  await win.fill('#email', email);
  await win.fill('#password', PASSWORD);
  await win.click('button[type="submit"]');
  return win;
}
