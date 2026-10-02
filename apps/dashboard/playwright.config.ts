import { defineConfig, devices } from "@playwright/test";

const DASHBOARD_URL = process.env["DASHBOARD_BASE_URL"] ?? "http://localhost:3000";
const API_URL = process.env["API_BASE_URL"] ?? "http://localhost:3001";

// Playwright's webServer env is merged on top of process.env, not a
// replacement — omitting NODE_ENV here doesn't stop a "development" value
// from a locally-sourced .env leaking through. `next build && next start`
// needs it pinned to "production" explicitly, or it prints a "non-standard
// NODE_ENV" warning and ships a dev/prod-mismatched bundle that crashes
// static generation with a `useContext` null error.

export default defineConfig({
  testDir: "../../tests/e2e",
  globalSetup: "../../tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: DASHBOARD_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: "/opt/pw-browsers/chromium" } },
    },
  ],
  webServer: [
    {
      command: "pnpm run build && pnpm run start",
      cwd: "../api",
      url: `${API_URL}/health/live`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: { ...process.env, API_PORT: "3001" } as Record<string, string>,
    },
    {
      command: "pnpm run build && pnpm run start",
      url: DASHBOARD_URL,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: { ...process.env, NODE_ENV: "production" } as Record<string, string>,
    },
  ],
});
