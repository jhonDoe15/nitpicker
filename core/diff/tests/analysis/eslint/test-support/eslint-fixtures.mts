import path from 'node:path';
import { createEslintAnalyzer } from '../../../../../../languages/typescript/adapters/eslint/analyzer.mjs';
import type { ProfiledAnalyzer } from '../../../../../../shared/values/analyzers.mts';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import { PACKAGE_ROOT } from '../../../../../tooling/tool-resolution.mjs';
import type { FileMap } from '../../../../git/test-support/fixture-files.mts';
import { useGitFixtures } from '../../../../git/test-support/git-repository.mts';

export const toolRoot = PACKAGE_ROOT;

type EslintAnalyzerOptions = {
  readonly name: string;
  readonly version: string;
  readonly configurationHash: string;
  readonly exclusions: string[];
  readonly configRelativePath: string;
  readonly patterns: string[];
  readonly policyFiles: string[];
  readonly timeoutMs: number | undefined;
  readonly eslintTimeoutMs: number | undefined;
  readonly eslintCliPath: string | undefined;
  readonly environment: Readonly<Record<string, string>>;
  readonly shardWeight: number;
  readonly policyFromPackage: boolean;
};

type EslintAnalyzerOverrides = Partial<EslintAnalyzerOptions>;

function isProfiled(value: unknown): value is ProfiledAnalyzer {
  return (
    typeof fieldOf(value, 'name') === 'string' &&
    typeof fieldOf(value, 'createInvocation') === 'function'
  );
}

export function createProfiledAnalyzer(
  factory: (options: never) => unknown,
  options: object,
): ProfiledAnalyzer {
  const created: unknown = Reflect.apply(factory, undefined, [options]);
  if (!isProfiled(created)) {
    throw new TypeError('analyzer factory returned no analyzer');
  }
  return created;
}

type EslintRepository = {
  readonly root: string;
  readonly baseRef: string | undefined;
  readonly outputRoot: string;
};

const fixturesRoot = path.resolve(import.meta.dirname, '../../../../fixtures');

export const fakeEslintCliPath = path.join(fixturesRoot, 'fake-eslint-cli.mjs');

const replayEslintCliPath = path.join(fixturesRoot, 'replay-eslint-cli.mjs');

const recordedEslintReportsPath = path.join(fixturesRoot, 'eslint-recorded-reports.json');

const COMPARISON_BASE_REF = 'comparison-base';

export function useEslintFixtures(): {
  readonly temporaryRoot: (prefix: string) => string;
  readonly createRepository: (initialFiles: FileMap) => EslintRepository;
} {
  const git = useGitFixtures();

  function createRepository(initialFiles: FileMap): EslintRepository {
    const { root, baseRef } = git.createGitRepository(initialFiles, {
      prefix: 'eslint-quality-diff-',
      baseRef: COMPARISON_BASE_REF,
    });
    return { root, baseRef, outputRoot: path.join(root, 'reports/quality/diff') };
  }

  return { temporaryRoot: git.temporaryRoot, createRepository };
}

export function comparisonOptions(
  repository: EslintRepository,
  analyzers: readonly ProfiledAnalyzer[],
): {
  readonly repositoryRoot: string;
  readonly projectRelativePath: string;
  readonly headProjectRoot: string;
  readonly requestedBaseRef: string | undefined;
  readonly outputRoot: string;
  readonly analyzers: readonly ProfiledAnalyzer[];
} {
  return {
    repositoryRoot: repository.root,
    projectRelativePath: '.',
    headProjectRoot: toolRoot,
    requestedBaseRef: repository.baseRef,
    outputRoot: repository.outputRoot,
    analyzers,
  };
}

export function fixtureAnalyzer(
  name: string,
  configRelativePath = 'eslint.config.mjs',
  overrides: EslintAnalyzerOverrides = {},
): ProfiledAnalyzer {
  return createProfiledAnalyzer(createEslintAnalyzer, {
    name,
    version: 'fixture',
    configurationHash: 'fixture',
    exclusions: [],
    configRelativePath,
    patterns: ['src/main/**/*.ts'],
    policyFiles: [],
    timeoutMs: undefined,
    eslintTimeoutMs: undefined,
    eslintCliPath: undefined,
    environment: {},
    shardWeight: 1,
    policyFromPackage: false,
    ...overrides,
  });
}

export function recordedEslintAnalyzer(
  name: string,
  configRelativePath = 'eslint.config.mjs',
  overrides: EslintAnalyzerOverrides = {},
): ProfiledAnalyzer {
  return fixtureAnalyzer(name, configRelativePath, {
    eslintCliPath: replayEslintCliPath,
    environment: { NITPICKER_DIFF_REPLAY_RECORDINGS: recordedEslintReportsPath },
    ...overrides,
  });
}

export function policyFiles({
  lintRule = 'no-debugger',
  withTypedProject,
}: { readonly lintRule?: string; readonly withTypedProject?: true } = {}): FileMap {
  const files: Record<string, string> = {
    'eslint.config.mjs': [
      "import tseslint from 'typescript-eslint';",
      '',
      'export default tseslint.config({',
      "  files: ['src/main/**/*.ts'],",
      withTypedProject
        ? "  languageOptions: { parser: tseslint.parser, parserOptions: { project: './tsconfig.quality.json', tsconfigRootDir: import.meta.dirname } },"
        : '  languageOptions: { parser: tseslint.parser },',
      `  rules: { '${lintRule}': 'error' },`,
      '});',
      '',
    ].join('\n'),
    'languages/typescript/preset/eslint-config/policies/errors.config.mjs':
      focusedConfig('no-empty-function'),
    'languages/typescript/preset/eslint-config/policies/logging.config.mjs':
      focusedConfig('no-console'),
    'languages/typescript/preset/eslint-config/policies/module-effects.config.mjs':
      focusedConfig('no-unreachable'),
  };
  if (withTypedProject === true) {
    files['tsconfig.quality.json'] = `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noLib: true,
        types: [],
      },
      include: ['src/main/**/*.ts'],
    })}\n`;
  }
  return files;
}

function focusedConfig(rule: string): string {
  return [
    'export default [',
    '  {',
    "    files: ['src/main/**/*.ts'],",
    `    rules: { '${rule}': 'error' },`,
    '  },',
    '];',
    '',
  ].join('\n');
}

export function sourceWithDebugger(name: string): string {
  return `export function ${name}() {\n  debugger;\n}\n`;
}
