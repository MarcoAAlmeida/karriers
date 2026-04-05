import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // PixiJS uses WebGL — keep GPU enabled in headless mode
    launchOptions: {
      args: ['--enable-gpu', '--no-sandbox']
    }
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    // Start a fresh server for each test run to ensure latest code is loaded.
    // Set PLAYWRIGHT_REUSE_SERVER=1 to skip startup when iterating quickly.
    reuseExistingServer: !!process.env.PLAYWRIGHT_REUSE_SERVER,
    timeout: 120_000
  }
})
