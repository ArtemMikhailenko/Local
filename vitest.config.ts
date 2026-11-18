import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    alias: { "server-only": new URL("./tests/server-only-stub.ts", import.meta.url).pathname },
    coverage: { include: ["src/lib/**"], exclude: ["src/lib/db/**", "src/lib/client/**"] },
  },
});
