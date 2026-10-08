import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NITPICKER_MAX_PARALLEL: '1' },
    include: ['{core,adapters,preset}/**/*.test.mjs'],
    testTimeout: 30_000,
  },
});
