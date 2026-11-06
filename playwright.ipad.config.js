import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

// Opt-in Safari-engine coverage; the standard Chromium suite stays unchanged.
export default defineConfig({ ...base, projects: [
  { name: "ipad-webkit", testMatch: /dashboard-ipad-layout\.spec\.js/, use: { browserName: "webkit", isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: "desktop-webkit", testMatch: /dashboard-ipad-layout\.spec\.js|referee-headshot-crop\.spec\.js/, use: { browserName: "webkit" } },
] });
