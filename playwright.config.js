const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  use: {
    headless: !process.env.HEADED,  // 창이 필요하면 HEADED=1
    viewport: { width: 1280, height: 800 },
    baseURL: 'http://localhost:8123'
  },
  webServer: {
    command: 'python3 -m http.server 8123',
    port: 8123,
    reuseExistingServer: true
  }
});
