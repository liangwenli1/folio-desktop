// The Engines page: the catalog for this computer as a timeline, downloads deleted and profiles moved to the
// recommended version; platform admins upload versions straight to Folio's storage, recommend and remove them.
// The dev server lists admin@folio.test as a platform admin (config.yaml `admins`).
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, request, test } from '@playwright/test';
import { API, PASSWORD, SITE, account, chromiumProfile, dataDir, lastMail, launch, logIn } from './helpers';

test.setTimeout(120_000);
const ADMIN = 'admin@folio.test';
const engines = (win: import('@playwright/test').Page) => win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Engines' });

// The admin's account, made on the first run.
async function adminAccount(){
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { origin: SITE } });
  if ((await api.post('/auth/register', { data: { email: ADMIN, password: PASSWORD, locale: 'en' } })).ok()){
    await api.post('/auth/verify-email', { data: { code: (await lastMail(ADMIN)).Text.match(/\b\d{6}\b/)![0] } });
  } else await api.post('/auth/login', { data: { email: ADMIN, password: PASSWORD } });
  const me = await (await api.get('/me')).json();
  expect(me.admin).toBe(true);
  return { api, workspaceId: me.workspaces[0].id as string };
}

test('a platform admin uploads a version, makes it recommended, profiles move to it, and it comes off again', async () => {
  const admin = await adminAccount();
  const version = `151.0.${Date.now() % 100000}.1`;
  const file = join(mkdtempSync(join(tmpdir(), 'folio-pkg-')), `ungoogled-chromium-${version}-1-x86_64_linux.tar.xz`);
  writeFileSync(file, `a pretend engine package ${version}`);
  const base = `/workspaces/${admin.workspaceId}/profiles`;
  // The admin's workspace starts empty on every run.
  const clear = async () => {
    const ids = (await (await admin.api.get(base)).json()).profiles.map((p: { id: string }) => p.id);
    if (ids.length) await admin.api.post(`${base}/batch`, { data: { action: 'trash', ids } });
    const gone = (await (await admin.api.get(`${base}?trash=1`)).json()).profiles.map((p: { id: string }) => p.id);
    if (gone.length) await admin.api.post(`${base}/batch`, { data: { action: 'purge', ids: gone } });
  };
  await clear();
  const made = await Promise.all(['Old-1', 'Old-2'].map(async n => (await (await admin.api.post(base, { data: chromiumProfile(n) })).json()).id as string));
  const app = await launch(dataDir(), { FOLIO_KERNELS_DIR: mkdtempSync(join(tmpdir(), 'folio-kernels-')) });
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog; }, file);
  const win = await logIn(app, ADMIN);
  try {
    await engines(win).click();
    await win.getByRole('button', { name: 'Upload a version' }).click();
    const dialog = win.getByRole('dialog', { name: 'Upload an engine version' });
    await dialog.getByRole('button', { name: 'Choose a file…' }).click();
    // Engine, system and version come from the file name.
    await expect(dialog.getByRole('group', { name: 'Engine' }).getByRole('button', { name: 'Chromium' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByLabel('System')).toHaveText(/Linux/);
    await expect(dialog.getByLabel('Version')).toHaveValue(version);
    await dialog.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(dialog).toBeHidden();

    const row = win.locator(`tr[data-engine="chromium"][data-version="${version}"]`);
    await expect(row).toContainText('Linux');
    await expect(row).toContainText('Download');
    await row.getByRole('button', { name: `Actions for Chromium ${version}` }).click();
    await win.getByRole('menuitem', { name: 'Make recommended' }).click();
    const making = win.getByRole('dialog', { name: `Make Chromium ${version} the recommended version?` });
    await making.getByLabel('What changed (optional)').fill('Chrome 151 security fixes');
    await making.getByRole('button', { name: 'Make recommended' }).click();
    await expect(row).toContainText('Recommended');
    await expect(row).toContainText('Chrome 151 security fixes');
    await expect(win.locator('tr[data-engine="chromium"][data-version="150.0.7871.186"]')).not.toContainText('Recommended');

    // Profiles on the older version move to it in one go.
    const banner = win.getByRole('status').filter({ hasText: 'use the older Chromium' });
    await expect(banner).toContainText('2 profiles use the older Chromium 150');
    await banner.getByRole('button', { name: `Upgrade to ${version}` }).click();
    await expect.poll(async () => (await (await admin.api.get(base)).json()).profiles.filter((p: { id: string; kernelVersion: string }) => made.includes(p.id) && p.kernelVersion === version).length).toBe(2);
    await expect(banner).toHaveCount(0);

    await row.getByRole('button', { name: `Actions for Chromium ${version}` }).click();
    await win.getByRole('menuitem', { name: 'Remove' }).click();
    const removing = win.getByRole('dialog', { name: `Remove Chromium ${version} from the catalog?` });
    await expect(removing).toContainText('2 profiles use it');
    await removing.getByRole('button', { name: 'Remove' }).click();
    await expect(row).toHaveCount(0);
  } finally {
    // The seeded version is the recommended one again, for the other tests.
    const { kernels } = await (await admin.api.get('/kernels')).json() as { kernels: { id: string; kind: string; version: string; platform: string }[] };
    const seeded = kernels.find(k => k.kind === 'chromium' && k.version === '150.0.7871.186' && k.platform === 'linux-x64')!;
    await admin.api.patch(`/kernels/${seeded.id}`, { data: { recommended: true } });
    for (const k of kernels.filter(k => k.version === version)) await admin.api.delete(`/kernels/${k.id}`);
    await clear();
    await app.close();
  }
});

test('the catalog for this computer: what is downloaded, deleting a download, and the recommended version for new profiles', async () => {
  const acct = await account();
  const dir = mkdtempSync(join(tmpdir(), 'folio-kernels-'));
  // A Chromium that looks downloaded: its program file where the package puts it.
  mkdirSync(join(dir, 'chromium-150.0.7871.186'));
  writeFileSync(join(dir, 'chromium-150.0.7871.186', 'chrome'), '');
  const app = await launch(dataDir(), { FOLIO_KERNELS_DIR: dir });
  const win = await logIn(app, acct.email);
  await engines(win).click();
  await expect(win.getByRole('button', { name: 'Upload a version' })).toHaveCount(0);

  const chromium = win.locator('tr[data-engine="chromium"][data-version="150.0.7871.186"]');
  await expect(chromium).toContainText('Recommended');
  await expect(chromium).toContainText('Downloaded');
  const firefox = win.locator('tr[data-engine="firefox"][data-version="156.0.1-beta.36"]');
  await expect(firefox.getByRole('button', { name: 'Download · 1.2 GB' })).toBeVisible();

  await chromium.getByRole('button', { name: 'Delete from this computer' }).click();
  await expect(chromium.getByRole('button', { name: 'Download · 139 MB' })).toBeVisible();
  expect(existsSync(join(dir, 'chromium-150.0.7871.186'))).toBe(false);

  await win.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Profiles' }).click();
  await win.getByRole('button', { name: 'New profile' }).click();
  const form = win.getByRole('dialog', { name: 'New profile' });
  await expect(form.getByLabel('Engine version')).toHaveText(/150\.0\.7871\.186/);
  await expect(form.getByTestId('fingerprint')).toContainText('Chromium 150');
  await app.close();
});
