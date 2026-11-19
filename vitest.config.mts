import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Agent worktrees under .claude/ hold stale copies of the tests.
    exclude: [...configDefaults.exclude, ".claude/**", "test/integration/**"],
  },
});
