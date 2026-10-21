import { defineConfig } from '@playwright/test';

// Drives the built app (npm run build) against a folio-server with DEV_TOOLS=1 and MOCK_PAYMENTS=1 on localhost:47110.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' }
});
