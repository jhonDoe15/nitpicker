import { existsSync, readFileSync } from 'node:fs';
import { loadConfigFromFile } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

const policyFile = process.env.NITPICKER_POLICY;
type NitpickerPolicy = {
  layout?: { sourceRoots?: string[]; testRoots?: string[] };
  exclude?: string[];
};
function isPolicy(value: unknown): value is NitpickerPolicy {
  return typeof value === 'object' && value !== null;
}
function readPolicy(file: string | undefined): NitpickerPolicy {
  if (!file) {
    return {};
  }
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return isPolicy(parsed) ? parsed : {};
}
const policy = readPolicy(policyFile);
const sourceRoots: string[] = policy.layout?.sourceRoots ?? ['src'];
const testRoots: string[] = policy.layout?.testRoots ?? ['test', 'tests', '__tests__'];
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
  experimentalAstAwareRemapping: true,
  include: sourceRoots.map((root) => `${root}/**/*.${codeExtensions}`),
  exclude: [
    ...sourceRoots.flatMap((root) => [
      `${root}/**/__tests__/**`,
      `${root}/**/*.{test,spec}.${codeExtensions}`,
    ]),
    'dist/**',
    'build/**',
    'generated/**',
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
          restoreMocks: true,
        },
      },
      {
        test: {
          name: 'quality-integration',
          root: '.',
          include: testRoots.flatMap(testFiles),
          exclude: nitpickerExclude,
          restoreMocks: true,
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
      reporters: [],
      outputFile: undefined,
      maxWorkers: 4,
      restoreMocks: true,
      coverage,
    },
  };
}

function timeoutLimits() {
  const parsed: unknown = JSON.parse(process.env.NITPICKER_TEST_TIMEOUT_LIMITS ?? '{}');
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('testTimeoutMs' in parsed) ||
    typeof parsed.testTimeoutMs !== 'number'
  ) {
    throw new Error('Nitpicker test timeout settings are missing.');
  }
  const hookTimeoutMs = 'hookTimeoutMs' in parsed ? parsed.hookTimeoutMs : undefined;
  return {
    testTimeoutMs: parsed.testTimeoutMs,
    ...(typeof hookTimeoutMs === 'number' ? { hookTimeout: hookTimeoutMs } : {}),
  };
}

function setupFilesOf(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry: unknown): entry is string => typeof entry === 'string');
  }
  return [];
}

function timeoutSettings<T extends object>(test: T) {
  const setup = process.env.NITPICKER_TEST_TIMEOUT_SETUP;
  if (setup === undefined) {
    return test;
  }
  const limits = timeoutLimits();
  const existing = 'setupFiles' in test ? test.setupFiles : [];
  return {
    ...test,
    testTimeout: limits.testTimeoutMs,
    ...('hookTimeout' in limits ? { hookTimeout: limits.hookTimeout } : {}),
    setupFiles: [setup, ...setupFilesOf(existing)],
  };
}

export default defineConfig(async () => {
  const projectConfigFile = projectConfigInWorkingDirectory();
  const config =
    projectConfigFile === undefined
      ? configWithoutProjectConfig
      : await layeredOnProjectConfig(projectConfigFile);
  if (process.env.NITPICKER_TEST_TIMEOUT_SETUP === undefined) {
    return config;
  }
  const projects =
    config.test.projects === undefined
      ? undefined
      : await Promise.all(
          config.test.projects.map(async (entry) => {
            const project = await entry;
            if (typeof project !== 'object') {
              throw new Error('Nitpicker timeout scopes require inline Vitest projects.');
            }
            return { ...project, test: timeoutSettings(project.test ?? {}) };
          }),
        );
  return {
    ...config,
    test: { ...timeoutSettings(config.test), ...(projects === undefined ? {} : { projects }) },
  };
});
