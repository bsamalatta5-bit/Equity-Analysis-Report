import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ["**/*.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["../integration/setup-env.ts"],
    fileParallelism: false,
  },
});
