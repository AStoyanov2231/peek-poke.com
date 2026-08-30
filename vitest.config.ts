import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/client-data.ts",
        "src/lib/internal-redirect.ts",
        "src/lib/invite-token.ts",
      ],
      thresholds: {
        branches: 85,
        functions: 100,
        lines: 95,
        statements: 95,
      },
    },
  },
});
