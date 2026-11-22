import { defineConfig } from "vitest/config";

// Rendering and decoding labels takes several seconds on a shared CI runner.
export default defineConfig({
  test: { testTimeout: 30_000 },
});
