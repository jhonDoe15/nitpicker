import { writtenFile } from './engine-run.mts';

export type EngineTestPatterns = {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly includeRegexes: readonly string[];
  readonly excludeRegexes: readonly string[];
};

export type EngineLayoutConfig = {
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly extensions: readonly string[];
  readonly colocatedTests: boolean;
  readonly excludedGlobs: readonly string[];
  readonly generatedFiles: readonly string[];
  readonly testPatterns: EngineTestPatterns;
};

export type EngineLayoutInput = {
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly extensions?: readonly string[] | undefined;
  readonly colocatedTests?: boolean | undefined;
  readonly hiddenGlobs?: readonly string[] | undefined;
  readonly excludedGlobs?: readonly string[] | undefined;
  readonly generatedFiles?: readonly string[] | undefined;
  readonly testFiles?: Partial<EngineTestPatterns> | undefined;
  readonly testPatterns?: Partial<EngineTestPatterns> | undefined;
};

export type EngineLintConfig = {
  readonly projectRoot?: string | undefined;
  readonly layout?: EngineLayoutConfig | undefined;
  readonly rules?: Readonly<Record<string, unknown>> | undefined;
};

export type TypescriptLintRequest = {
  readonly files: string;
  readonly config?: string | undefined;
  readonly rules?: readonly string[] | undefined;
  readonly out?: string | undefined;
  readonly extra?: readonly string[] | undefined;
};

const DEFAULT_EXTENSIONS: readonly string[] = [
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
];
const DEFAULT_TEST_INCLUDE: readonly string[] = [
  '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
];

function normalizePosix(value: string): string {
  return value.replaceAll('\\', '/').replace(/^(?:\.\/)+/u, '');
}

export function normalizeEngineRoot(root: string): string {
  const cleaned = normalizePosix(root)
    .replace(/\/+(?:\.\/+)*/gu, '/')
    .replace(/^\/+|\/+$/gu, '');
  return cleaned === '' || cleaned === '.' ? '.' : cleaned;
}

function normalizedPatterns(patterns: Partial<EngineTestPatterns> | undefined): EngineTestPatterns {
  const include = patterns?.include ?? DEFAULT_TEST_INCLUDE;
  return {
    include: [...new Set(include.map(normalizePosix))],
    exclude: [...new Set((patterns?.exclude ?? []).map(normalizePosix))],
    includeRegexes: [...new Set(patterns?.includeRegexes ?? [])],
    excludeRegexes: [...new Set(patterns?.excludeRegexes ?? [])],
  };
}

export function engineLayoutConfig(layout: EngineLayoutInput): EngineLayoutConfig {
  const excluded = layout.hiddenGlobs ?? layout.excludedGlobs ?? [];
  return {
    sourceRoots: layout.sourceRoots.map(normalizeEngineRoot),
    testRoots: layout.testRoots.map(normalizeEngineRoot),
    extensions: [...(layout.extensions ?? DEFAULT_EXTENSIONS)],
    colocatedTests: layout.colocatedTests === true,
    excludedGlobs: [...excluded],
    generatedFiles: (layout.generatedFiles ?? []).map(normalizePosix),
    testPatterns: normalizedPatterns(layout.testPatterns ?? layout.testFiles),
  };
}

export function writeEngineConfig(file: string, config: EngineLintConfig): string {
  return writtenFile(file, JSON.stringify(config));
}

export function typescriptLintArguments({
  files,
  config,
  rules,
  out,
  extra,
}: TypescriptLintRequest): string[] {
  return [
    'typescript-lint',
    '--files',
    files,
    ...(config === undefined ? [] : ['--config', config]),
    ...(rules === undefined || rules.length === 0 ? [] : ['--rules', rules.join(',')]),
    ...(out === undefined ? [] : ['--out', out]),
    ...(extra ?? []),
  ];
}
