import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (E1.2). Chromium only — the client's team uses Chrome and Edge,
 * and one engine keeps the suite fast enough to run before every push.
 *
 * By default Playwright starts `next dev` itself. Set PLAYWRIGHT_BASE_URL to run the
 * same tests against an already-running deployment (E1.9 live smoke test); no local
 * server is started then.
 */
const PORT = 3100;
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
