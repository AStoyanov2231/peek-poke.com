import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@peekpoke/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@peekpoke/design": fileURLToPath(new URL("../../packages/design/src/index.ts", import.meta.url)),
      "react-native": fileURLToPath(new URL("./test/react-native.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.cjs"],
    clearMocks: true,
  },
});
