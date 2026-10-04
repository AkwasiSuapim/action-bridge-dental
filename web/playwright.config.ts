import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    // Placeholder settings so sign-in is enabled; tests mock every Cognito call.
    env: {
      VITE_COGNITO_REGION: 'us-test-1',
      VITE_COGNITO_CLIENT_ID: 'testclient',
    },
  },
});
