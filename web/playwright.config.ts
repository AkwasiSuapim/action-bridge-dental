import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    // Fixed test settings: browser tests talk to the mock in tests/mock-api.ts, never the live stack.
    env: {
      VITE_API_BASE_URL: 'https://api.test.invalid/dev',
      VITE_COGNITO_CLIENT_ID: 'testclientid0123456789abcd',
      VITE_COGNITO_REGION: 'us-east-2',
    },
  },
});
