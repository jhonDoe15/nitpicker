import { existsSync, readFileSync } from 'node:fs';
import { loadConfigFromFile } from 'vite';
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

// This file is copied into the analyzed project, so it cannot import the package. It reads the
// head policy the CLI delivers through NITPICKER_POLICY and mirrors the defaults in
// preset/layout.mjs (a test keeps the two in step).
const policyFile = process.env.NITPICKER_POLICY;
const policy = policyFile ? JSON.parse(readFileSync(policyFile, 'utf8')) : {};
const sourceRoots: string[] = policy.layout?.sourceRoots ?? ['src'];
const testRoots: string[] = policy.layout?.testRoots ?? ['test', 'tests'];
const exclude: string[] = policy.exclude ?? [];
const codeExtensions = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const testFiles = (root: string) => [
  `${root}/**/*.test.${codeExtensions}`,
  `${root}/**/*.spec.${codeExtensions}`,
];

// The project's own Vitest or Vite config supplies how its tests run (environment, setup files,
// aliases, globals). nitpicker adds its test roots and owns coverage. Without a project config
// the defaults below run alone.
const PROJECT_CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${name}.config.${extension}`),
);
// Looked up when the config is resolved, relative to the directory Vitest runs in.
const findProjectConfig = () => PROJECT_CONFIG_NAMES.find((name) => existsSync(name));

const coverage = {
  provider: 'v8' as const,
  include: sourceRoots.map((root) => `${root}/**/*.${codeExtensions}`),
  exclude: [
    ...sourceRoots.flatMap((root) => [
      `${root}/**/__tests__/**`,
      `${root}/**/*.{test,spec}.${codeExtensions}`,
    ]),
    '**/dist/**',
    '**/build/**',
    '**/generated/**',
    '**/*.d.ts',
    ...sourceRoots.flatMap((root) => [`${root}/vitest.config.ts`, `${root}/main/vitest.config.ts`]),
    ...exclude,
  ],
  reporter: ['text', 'json'],
  reportsDirectory: 'reports/quality/coverage',
};

async function projectLayered(projectConfigFile: string) {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, projectConfigFile);
  const project = loaded?.config ?? {};
  const merged = mergeConfig(project, {
    test: {
      include: [...sourceRoots, ...testRoots].flatMap(testFiles),
      exclude: [...configDefaults.exclude, ...exclude],
    },
  });
  // Test roots are relative to the project root, whatever `dir` the project sets, and the
  // project's coverage settings and thresholds never decide nitpicker's coverage findings.
  return { ...merged, test: { ...merged.test, dir: undefined, maxWorkers: 4, coverage } };
}

// A function config, because top-level await fails when the project's package is CommonJS.
export default defineConfig(async () => {
  const projectConfigFile = findProjectConfig();
  return projectConfigFile === undefined
    ? {
        test: {
          maxWorkers: 4,
          projects: [
            {
              test: {
                name: 'quality-unit',
                root: '.',
                include: sourceRoots.flatMap(testFiles),
                exclude: [...configDefaults.exclude, ...exclude],
              },
            },
            {
              test: {
                name: 'quality-integration',
                root: '.',
                include: testRoots.flatMap(testFiles),
                exclude: [...configDefaults.exclude, ...exclude],
                testTimeout: 10_000,
              },
            },
          ],
          coverage,
        },
      }
    : await projectLayered(projectConfigFile);
});
