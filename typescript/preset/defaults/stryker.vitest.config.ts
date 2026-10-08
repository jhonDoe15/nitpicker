import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';

// Copied into the analyzed project like vitest.quality.config.ts; see the note there.
const policyFile = process.env.NITPICKER_POLICY;
const policy = policyFile ? JSON.parse(readFileSync(policyFile, 'utf8')) : {};
const sourceRoots: string[] = policy.layout?.sourceRoots ?? ['src'];
const testRoots: string[] = policy.layout?.testRoots ?? ['test', 'tests'];
const exclude: string[] = policy.exclude ?? [];

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      ...sourceRoots.flatMap((root) => [`${root}/**/*.test.ts`, `${root}/**/*.spec.ts`]),
      ...testRoots.map((root) => `${root}/**/*.test.ts`),
    ],
    exclude: [...configDefaults.exclude, ...exclude],
    testTimeout: 10_000,
  },
});
