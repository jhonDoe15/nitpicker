import { existsSync, readFileSync } from 'node:fs';
import { loadConfigFromFile } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

const policyFile = process.env.NITPICKER_POLICY;
const policy = policyFile ? JSON.parse(readFileSync(policyFile, 'utf8')) : {};
const sourceRoots: string[] = policy.layout?.sourceRoots ?? ['src'];
const testRoots: string[] = policy.layout?.testRoots ?? ['test', 'tests'];
const exclude: string[] = policy.exclude ?? [];
const codeExtensions = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const nitpickerExclude = [...configDefaults.exclude, ...exclude];

function testFiles(root: string) {
  return [`${root}/**/*.test.${codeExtensions}`, `${root}/**/*.spec.${codeExtensions}`];
}

const PROJECT_CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${name}.config.${extension}`),
);

function projectConfigInWorkingDirectory() {
  return PROJECT_CONFIG_NAMES.find((name) => existsSync(name));
}

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

const configWithoutProjectConfig = {
  test: {
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: 'quality-unit',
          root: '.',
          include: sourceRoots.flatMap(testFiles),
          exclude: nitpickerExclude,
        },
      },
      {
        test: {
          name: 'quality-integration',
          root: '.',
          include: testRoots.flatMap(testFiles),
          exclude: nitpickerExclude,
          testTimeout: 10_000,
        },
      },
    ],
    coverage,
  },
};

async function layeredOnProjectConfig(projectConfigFile: string) {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, projectConfigFile);
  const project = loaded?.config ?? {};
  return {
    ...project,
    test: {
      ...project.test,
      include: [
        ...(project.test?.include ?? []),
        ...[...sourceRoots, ...testRoots].flatMap(testFiles),
      ],
      exclude: [...(project.test?.exclude ?? []), ...nitpickerExclude],
      dir: undefined,
      maxWorkers: 4,
      coverage,
    },
  };
}

export default defineConfig(async () => {
  const projectConfigFile = projectConfigInWorkingDirectory();
  return projectConfigFile === undefined
    ? configWithoutProjectConfig
    : layeredOnProjectConfig(projectConfigFile);
});
