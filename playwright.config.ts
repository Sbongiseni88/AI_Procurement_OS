import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (E1.2). Chromium only — the client's team uses Chrome and Edge,
 * and one engine keeps the suite fast enough to run before every push.
 *
 * By default Playwright builds the app and serves it with `next start`, so tests see
 * what Vercel serves. `next dev` would not do: it rewrites Cache-Control on every
 * response, which hides the no-store headers the auth tests assert. Set
 * PLAYWRIGHT_BASE_URL to run the same tests against a deployment instead (E1.9 live
 * smoke test); no local server is started then.
 */
// Test setup creates and deletes users with the admin client, so the test process
// needs the same env as the app. Variables already set in the shell win.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 3100;
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

// The job runner route refuses requests without CRON_SECRET (E1.5.5). The local test
// server gets a fresh one per run, shared with the tests through the environment.
// Against a deployment, tests that call the runner are skipped unless it is exported.
if (externalBaseUrl === undefined && !process.env.CRON_SECRET) {
  process.env.CRON_SECRET = randomBytes(24).toString("hex");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // The first log-in on a freshly started server (or a cold Vercel function) can take
  // longer than the 5 s default while every worker starts at once.
  expect: { timeout: 10_000 },
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npm run build && npm run start -- --port ${PORT}`,
        url: `http://localhost:${PORT}`,
        // Always a fresh build: reusing a server left running would test stale code.
        reuseExistingServer: false,
        timeout: 240_000,
      },
});
