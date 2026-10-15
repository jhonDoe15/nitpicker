import { existsSync, readFileSync } from 'node:fs';
import { loadConfigFromFile, type Plugin } from 'vite';
import { configDefaults, defineConfig, type TestProjectConfiguration } from 'vitest/config';

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

const perProjectPins = {
  retry: 0,
  allowOnly: false,
  testTimeout: 10_000,
  hookTimeout: 10_000,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
};

const globalPins = {
  bail: 0,
  passWithNoTests: false,
  dangerouslyIgnoreUnhandledErrors: false,
  testNamePattern: undefined,
  update: 'none' as const,
};

const coverageIgnoreHint =
  /\/\*\s*(?:v8|c8|istanbul)\s+ignore\b[\s\S]*?\*\/|\/\/\s*(?:v8|c8|istanbul)\s+ignore\b[^\n]*/gu;

const stripCoverageIgnoreHints: Plugin = {
  name: 'nitpicker-strip-coverage-ignore-hints',
  enforce: 'pre',
  transform(code, id) {
    if (id.includes('/node_modules/') || !code.includes('ignore')) {
      return undefined;
    }
    const stripped = code.replaceAll(coverageIgnoreHint, (hint) => hint.replaceAll(/[^\n]/gu, ' '));
    return stripped === code ? undefined : { code: stripped, map: null };
  },
};

function pinnedProject(entry: TestProjectConfiguration): TestProjectConfiguration {
  if (typeof entry !== 'object' || entry instanceof Promise || typeof entry === 'function') {
    return entry;
  }
  return 'test' in entry ? { ...entry, test: { ...entry.test, ...perProjectPins } } : entry;
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
  plugins: [stripCoverageIgnoreHints],
  test: {
    ...globalPins,
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: 'quality-unit',
          root: '.',
          include: sourceRoots.flatMap(testFiles),
          exclude: nitpickerExclude,
          ...perProjectPins,
        },
      },
      {
        test: {
          name: 'quality-integration',
          root: '.',
          include: testRoots.flatMap(testFiles),
          exclude: nitpickerExclude,
          ...perProjectPins,
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
    plugins: [...(project.plugins ?? []), stripCoverageIgnoreHints],
    test: {
      ...project.test,
      projects: project.test?.projects?.map(pinnedProject),
      include: [
        ...(project.test?.include ?? []),
        ...[...sourceRoots, ...testRoots].flatMap(testFiles),
      ],
      exclude: [...(project.test?.exclude ?? []), ...nitpickerExclude],
      dir: undefined,
      maxWorkers: 4,
      ...globalPins,
      ...perProjectPins,
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
