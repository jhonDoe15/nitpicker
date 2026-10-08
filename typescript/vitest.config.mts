import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { QUALITY_MAX_PARALLEL: '1' },
    include: ['{core,adapters,preset}/**/*.test.mjs', '../evals/**/*.test.mjs'],
    testTimeout: 30_000,
  },
});
