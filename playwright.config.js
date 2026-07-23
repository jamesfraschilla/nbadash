import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:4174/nbadash/",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: "VITE_ENABLE_ACCOUNTS=false npm run dev -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174/nbadash/visual-test.html",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
