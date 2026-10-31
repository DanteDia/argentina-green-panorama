import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["lib/**/__tests__/**/*.test.ts"], environment: "node", testTimeout: 20000 },
  resolve: { alias: { "@": path.resolve(__dirname, "."), "server-only": path.resolve(__dirname, "lib/arte/__tests__/server-only-stub.ts") } },
});
