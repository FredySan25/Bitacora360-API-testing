import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const envFile = path.resolve(__dirname, ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { timeout: 10_000 },

  use: {
    trace: "on-first-retry",
  },

  // No browsers and no web server: the tests talk to Supabase over HTTP.
  projects: [
    // Signs in the two test users once and saves their access tokens.
    { name: "setup", testMatch: /users\.setup\.ts/ },
    { name: "auth", testDir: "./tests/auth" },
    { name: "habits", testDir: "./tests/habits", dependencies: ["setup"] },
  ],
});
