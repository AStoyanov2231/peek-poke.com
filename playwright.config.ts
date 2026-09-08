import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL;
const fixtureEnabled = process.env.E2E_FIXTURE === "1";

if (baseURL) {
  const host = new URL(baseURL).hostname;
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host)) {
    throw new Error("E2E_BASE_URL must be a loopback URL backed by an isolated test environment.");
  }
}

export default defineConfig({
  testDir: "./test/e2e",
  webServer: process.env.E2E_FIXTURE === "1" ? { command: "node test/e2e/start-fixture-environment.mjs", url: "http://127.0.0.1:3001/login", reuseExistingServer: false, timeout: 120_000 } : undefined,
  outputDir: "test-results/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    launchOptions: {
      ...(process.env.E2E_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH } : {}),
      // GPU-less CI runners render only our test-owned fixture map.
      ...(fixtureEnabled ? { args: ["--enable-unsafe-swiftshader"] } : {}),
    },
    baseURL: baseURL ?? (process.env.E2E_FIXTURE === "1" ? "http://127.0.0.1:3001" : "http://127.0.0.1:3000"),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
