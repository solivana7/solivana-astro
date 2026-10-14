import { defineConfig, devices } from "@playwright/test"

// Browser smoke tests run against the local dev server (or a manually started
// one). They are intentionally separate from the vitest suite: npm run test:e2e.
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
