import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: [
      "src/lib/forge/__tests__/**/*.test.ts",
      "src/lib/security/__tests__/**/*.test.ts"
    ]
  }
});
