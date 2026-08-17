import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "widget",
      testDir: "./e2e/widget",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:5173",
      },
    },
    {
      // One-off asset-generation script (public/gallery/*.png for the
      // /gallery page), not a CI test — deliberately excluded from the
      // "widget" project's default testMatch (**/*.@(spec|test).ts) via
      // its filename, and given its own explicit testMatch here so it's
      // only ever run when asked for by name (`--project=gallery-capture`).
      name: "gallery-capture",
      testDir: "./e2e/widget",
      testMatch: "capture-gallery-screenshots.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:5173",
      },
    },
  ],

  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @mpnext/embed-sdk demo",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
