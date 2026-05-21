import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },
    {
      name: 'authenticated',
      use: {
        ...devices['iPhone 14'],
        storageState: 'e2e/.auth/user.json',
      },
      testIgnore: ['**/auth-protection.spec.ts'],
      dependencies: ['setup'],
    },
    {
      name: 'unauthenticated',
      use: {
        ...devices['iPhone 14'],
      },
      testMatch: ['**/auth-protection.spec.ts'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
