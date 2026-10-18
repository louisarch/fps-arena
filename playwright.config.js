import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', timeout: 30000,
  fullyParallel: false, workers: 1,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:4188', viewport: { width: 1280, height: 720 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  reporter: [['list'], ['json', { outputFile: 'test-results/browser.json' }]],
  webServer: process.env.TEST_BASE_URL ? undefined : { command: 'npm run dev -- --port 4188', url: 'http://127.0.0.1:4188', reuseExistingServer: !process.env.CI },
});
