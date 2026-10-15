import { existsSync, globSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
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
  restoreMocks: true,
};

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

const stripCoverageIgnoreHints: Plugin = {
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
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, configFile);
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
      if (typeof entry === 'string') return [];
      if (entry instanceof Promise) return [entry.then(pinnedInline)];
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
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, projectConfigFile);
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
      maxWorkers: 4,
      ...globalPins,
      ...perProjectPins,
      ...timeoutPins(project.test),
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
