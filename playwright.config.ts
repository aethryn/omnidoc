import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_APP_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: process.env.E2E_AUTH_STATE || undefined,
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 5"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.PLAYWRIGHT_START_SERVER === "1" ? { command: "npm run dev -- --hostname 127.0.0.1", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 } : undefined,
});
