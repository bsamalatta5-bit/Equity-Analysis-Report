import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // NestJS relies on emitDecoratorMetadata for constructor injection by
  // type (e.g. `constructor(private readonly x: SomeService)` with no
  // explicit @Inject()); esbuild (vitest's default transform) does not
  // emit that metadata, so DI silently breaks in tests without this.
  plugins: [swc.vite()],
  test: {
    include: ["**/*.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["./setup-env.ts"],
    // Integration tests share one Postgres database and must not run
    // migrations or seed data concurrently against it.
    fileParallelism: false,
  },
});
