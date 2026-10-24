import { defineConfig } from '@playwright/test';

// Records the product demo (capture.spec.ts); not part of the tests.
export default defineConfig({
  testDir: '.',
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' }
});
