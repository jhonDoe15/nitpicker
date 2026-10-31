import { existsSync, globSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as Vite from 'vite';
import { configDefaults, defineConfig, type TestProjectConfiguration } from 'vitest/config';

function isVite(module: unknown): module is typeof Vite {
  return typeof module === 'object' && module !== null && 'loadConfigFromFile' in module;
}
async function loadConfigFromFile(file: string) {
  const fromVitest = createRequire(createRequire(import.meta.url).resolve('vitest/package.json'));
  const viteRoot = path.dirname(fromVitest.resolve('vite/package.json'));
  const vite: unknown = await import(pathToFileURL(path.join(viteRoot, 'dist/node/index.js')).href);
  if (!isVite(vite)) {
    throw new Error('nitpicker found no Vite next to the Vitest this project installs.');
  }
  return vite.loadConfigFromFile({ command: 'serve', mode: 'test' }, file);
}
type NitpickerPolicy = {
  layout?: { sourceRoots?: string[]; testRoots?: string[]; colocatedTests?: boolean };
  exclude?: string[];
};
function isPolicy(value: unknown): value is NitpickerPolicy {
  return typeof value === 'object' && value !== null;
}
function readPolicy(file: string | undefined): NitpickerPolicy {
  const parsed: unknown = file ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return isPolicy(parsed) ? parsed : {};
}
const policy = readPolicy(process.env.NITPICKER_POLICY);
const sourceRoots: string[] = policy.layout?.sourceRoots ?? ['src'];
const testRoots: string[] = policy.layout?.testRoots ?? ['test', 'tests', '__tests__'];
const exclude: string[] = policy.exclude ?? [];
const testSupportDirectories = policy.layout?.colocatedTests === true ? ['test-support'] : [];
const codeExtensions = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const nitpickerExclude = [...configDefaults.exclude, ...exclude];

function testFiles(root: string) {
  return [`${root}/**/*.test.${codeExtensions}`, `${root}/**/*.spec.${codeExtensions}`];
}

const PROJECT_CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${name}.config.${extension}`),
);

const perProjectPins = { retry: 0, allowOnly: false, restoreMocks: true };

const MINIMUM_TIMEOUT = 10_000;
type Timeouts = { testTimeout?: number; hookTimeout?: number };

function timeoutPins(test: Timeouts | undefined) {
  return {
    testTimeout: Math.max(test?.testTimeout ?? 0, MINIMUM_TIMEOUT),
    hookTimeout: Math.max(test?.hookTimeout ?? 0, MINIMUM_TIMEOUT),
  };
}

const globalPins = {
  bail: 0,
  passWithNoTests: false,
  dangerouslyIgnoreUnhandledErrors: false,
  testNamePattern: undefined,
  update: 'none' as const,
};

const coverageIgnoreHint =
  /\/\*\s*(?:v8|c8|istanbul)\s+ignore\b[\s\S]*?\*\/|\/\/\s*(?:v8|c8|istanbul)\s+ignore\b[^\n]*/gu;

const stripCoverageIgnoreHints: Vite.Plugin = {
  name: 'nitpicker-strip-coverage-ignore-hints',
  enforce: 'pre',
  transform(code, id) {
    if (id.includes('/node_modules/') || !code.includes('ignore')) {
      return undefined;
    }
    const stripped = code.replaceAll(coverageIgnoreHint, (hint) => hint.replaceAll(/[^\n]/gu, ' '));
    return stripped === code ? undefined : { code: stripped };
  },
};

type InlineProject = Exclude<
  TestProjectConfiguration,
  string | Promise<unknown> | ((...parameters: never[]) => unknown)
>;

const PROJECT_CONFIG_FILE = /^vite(?:st)?(?:\.[\w-]+)?\.config\./u;
const GLOB_CHARACTERS = /[*?[\]{}]/u;

function pinnedInline(entry: InlineProject, extended: Timeouts = {}): InlineProject {
  return {
    ...entry,
    plugins: [...(entry.plugins ?? []), stripCoverageIgnoreHints],
    test: { ...entry.test, ...perProjectPins, ...timeoutPins({ ...extended, ...entry.test }) },
  };
}

function directoryConfig(directory: string) {
  const files = new Set(readdirSync(directory));
  const name = PROJECT_CONFIG_NAMES.find((candidate) => files.has(candidate));
  return name === undefined ? undefined : path.join(directory, name);
}

async function projectAt(projectPath: string): Promise<InlineProject> {
  const isFile = statSync(projectPath).isFile();
  const configFile = isFile ? projectPath : directoryConfig(projectPath);
  const root = isFile ? path.dirname(projectPath) : projectPath;
  if (configFile === undefined) {
    return pinnedInline({ root });
  }
  const loaded = await loadConfigFromFile(configFile);
  return pinnedInline({ extends: configFile, root }, loaded?.config.test);
}

function isProjectMatch(match: string) {
  return statSync(match).isDirectory() || PROJECT_CONFIG_FILE.test(path.basename(match));
}

function isNegatedBy(negated: readonly string[], match: string) {
  return negated.some((pattern) => path.matchesGlob(path.relative(process.cwd(), match), pattern));
}

function projectPaths(patterns: readonly string[]) {
  const negated = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));
  return patterns
    .filter((pattern) => !pattern.startsWith('!'))
    .flatMap((pattern) =>
      GLOB_CHARACTERS.test(pattern)
        ? globSync(pattern, { exclude: (entry) => entry.includes('node_modules') })
            .map((match) => path.resolve(match))
            .filter(isProjectMatch)
        : [path.resolve(pattern)],
    )
    .filter((match) => !isNegatedBy(negated, match));
}

function pinnedProjects(entries: readonly TestProjectConfiguration[]): TestProjectConfiguration[] {
  const paths = entries
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.replace('<rootDir>', process.cwd()));
  return [
    ...[...new Set(projectPaths(paths))].map(projectAt),
    ...entries.flatMap((entry): TestProjectConfiguration[] => {
      if (typeof entry === 'string') {
        return [];
      }
      if (entry instanceof Promise) {
        return [entry.then(pinnedInline)];
      }
      if (typeof entry === 'function') {
        return [async (environment) => pinnedInline(await entry(environment))];
      }
      return [pinnedInline(entry)];
    }),
  ];
}

const coverage = {
  provider: 'v8' as const,
  include: sourceRoots.map((root) => `${root}/**/*.${codeExtensions}`),
  exclude: [
    ...sourceRoots.flatMap((root) => [
      `${root}/**/__tests__/**`,
      ...testSupportDirectories.map((directory) => `${root}/**/${directory}/**`),
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
  plugins: [stripCoverageIgnoreHints],
  test: {
    ...globalPins,
    maxWorkers: 4,
    projects: [
      pinnedInline({
        test: {
          name: 'quality-unit',
          root: '.',
          include: sourceRoots.flatMap(testFiles),
          exclude: nitpickerExclude,
        },
      }),
      pinnedInline({
        test: {
          name: 'quality-integration',
          root: '.',
          include: testRoots.flatMap(testFiles),
          exclude: nitpickerExclude,
        },
      }),
    ],
    coverage,
  },
};

async function layeredOnProjectConfig(projectConfigFile: string) {
  const loaded = await loadConfigFromFile(projectConfigFile);
  const project = loaded?.config ?? {};
  return {
    ...project,
    plugins: [...(project.plugins ?? []), stripCoverageIgnoreHints],
    test: {
      ...project.test,
      projects: project.test?.projects && pinnedProjects(project.test.projects),
      include: [
        ...(project.test?.include ?? []),
        ...[...sourceRoots, ...testRoots].flatMap(testFiles),
      ],
      exclude: [...(project.test?.exclude ?? []), ...nitpickerExclude],
      dir: undefined,
      reporters: [],
      outputFile: undefined,
      maxWorkers: 4,
      ...globalPins,
      ...perProjectPins,
      ...timeoutPins(project.test),
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
  const projectConfigFile = PROJECT_CONFIG_NAMES.find((name) => existsSync(name));
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
