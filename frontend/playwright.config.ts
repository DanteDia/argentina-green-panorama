import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://localhost:3010", headless: true },
  reporter: [["list"]],
});
