import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Unit tests for the pure logic in lib/ — the figures shown to a user and the
// series a chart is drawn from. No DOM, no Next runtime: everything covered
// here is a function of its inputs, which is why it is testable at all.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // `server-only` throws if imported outside a React Server Component. It is
      // a build-time guard, and the parsing it guards is plain string work.
      "server-only": resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
