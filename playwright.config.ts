import { defineConfig, devices } from "playwright/test";

const localChromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const localChromiumLaunchOptions = localChromiumExecutable
  ? { executablePath: localChromiumExecutable }
  : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  snapshotPathTemplate:
    "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4173/eclipse-26/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: localChromiumLaunchOptions,
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        launchOptions: localChromiumLaunchOptions,
      },
    },
    {
      name: "firefox",
      grep: /@smoke/,
      use: {
        ...devices["Desktop Firefox"],
        firefoxUserPrefs: {
          "gfx.webrender.software": true,
          "layers.acceleration.disabled": true,
        },
        launchOptions:
          process.platform === "win32"
            ? {
                env: {
                  ...process.env,
                  MOZ_DISABLE_CONTENT_SANDBOX: "1",
                  MOZ_DISABLE_RDD_SANDBOX: "1",
                },
              }
            : undefined,
      },
    },
    {
      name: "webkit",
      grep: /@smoke/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-webkit",
      grep: /@smoke/,
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
});
