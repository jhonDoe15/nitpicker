import {
  isProjectRoot,
  normalizeRoot,
  PROJECT_ROOT_EXCLUDED_GLOBS,
  underRoot,
} from './layout/source-root/root-paths.mts';
import { filePatterns, globsFor } from './layout/path-patterns.mts';
import { END_TO_END_ROOT, endToEndFor } from './layout/end-to-end.mts';
import {
  codeFilesUnder,
  existingRoots,
  DEPENDENCY_PATH_PATTERN,
} from './layout/code-files/project-code-files.mts';
export { existingRoots, DEPENDENCY_PATH_PATTERN } from './layout/code-files/project-code-files.mts';
import { escapeRegExp as untypedEscapeRegExp, globMatcher } from '../../../shared/paths/glob.mts';
import { excludePatternOf } from './layout/exclude/exclude-pattern.mts';
import type {
  ClassifierInput,
  ExcludedGlobs,
  ExtensionFacts,
  LayoutClassifiers,
  LayoutOptions,
  LayoutPolicy,
  PolicyLayout,
  ResolveOptions,
  ResolvedLayout,
} from './typed/layout-types.mts';
import {
  isJavascriptPolicy,
  JAVASCRIPT_EXTENSIONS,
  TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT,
} from '../../javascript/preset/javascript-preset.mts';
import {
  defaultTestFiles,
  policyTestFiles,
  testFileMatcher,
} from './test-runner/test-files/test-file-patterns.mts';
import {
  sourceRootLookups,
  sourceUnderRootClassifier,
  testFileClassifier,
  testInputPattern,
  toPosix,
} from './layout/file-classifiers.mts';

export { globMatcher };
export { toPosix };

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
const globTest: (glob: string) => { test(file: string): boolean } = globMatcher;

const defaultSourceRoots = ['src'] as const;
export { END_TO_END_ROOT } from './layout/end-to-end.mts';
const defaultTestRoots = ['test', 'tests', '__tests__', END_TO_END_ROOT];
export const codeExtensionNames = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];
export const codeExtensions = `{${codeExtensionNames.join(',')}}`;
export const stylesheetExtensionNames = ['css', 'scss', 'sass', 'less', 'styl', 'pcss'];
export const stylesheetSpecifier = new RegExp(
  `\\.(?:${stylesheetExtensionNames.join('|')})(?:\\?.*)?$`,
  'u',
);
export const cssInJsSource =
  /^(?:styled-components(?:\/|$)|@emotion\/|@stitches\/react$|goober$|@linaria\/)/u;
const javascriptProjectExtensionNames = [
  ...TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT,
  ...JAVASCRIPT_EXTENSIONS,
];
const typescriptFormatExtensionNames = ['ts', 'tsx', 'mts', 'mjs'];
const ROOT_OUTPUT_FOLDERS = ['dist', 'build', 'generated', 'coverage', 'reports/quality', 'target'];
export const builtInExcludedGlobs = [
  ...ROOT_OUTPUT_FOLDERS.map((folder) => `${folder}/**`),
  '**/node_modules/**',
];
const declarationGlobs = ['**/*.d.ts'];
const ROOT_OUTPUT_PATTERN = `^(?:${ROOT_OUTPUT_FOLDERS.join('|')})(?:/|$)`;
export const EXCLUDED_PATH_PATTERN = `${ROOT_OUTPUT_PATTERN}|${DEPENDENCY_PATH_PATTERN}`;
const GENERATED_NAME = '(?:^|/)__generated__(?:/|$)|(?:\\.(?:generated|gen|pb)|_pb)\\.[^/]+$';
const GENERATED_CANDIDATE = new RegExp(`${ROOT_OUTPUT_PATTERN}|${GENERATED_NAME}`);
const DEPENDENCY_PATH = new RegExp(DEPENDENCY_PATH_PATTERN);

export function mayBeGenerated(file: string): boolean {
  return GENERATED_CANDIDATE.test(toPosix(file)) && !DEPENDENCY_PATH.test(toPosix(file));
}

export const FIXTURE_PATH = /(?:^|\/)(?:fixtures|__fixtures__)\//;

export function prettierPatterns(layout: {
  readonly formatExtensions: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
}): string[] {
  const code = layout.formatExtensions.join(',');
  return [
    ...layout.sourceRoots.map((root) => underRoot(root, `**/*.{${code},json,yaml,yml}`)),
    ...layout.testRoots.map((root) => underRoot(root, `**/*.{${code},json}`)),
    `*.{${code},json}`,
  ];
}

function createClassifiers({
  sourceRoots,
  testRoots,
  exclude,
  patterns,
  generatedFiles,
  testFiles,
}: ClassifierInput): LayoutClassifiers {
  const excludeMatchers = exclude.map(globTest);
  const isRunnerTest = testFileMatcher(testFiles);
  const generated = new Set(generatedFiles);
  const testInput = testInputPattern(testRoots);
  function isGeneratedPath(file: string): boolean {
    const normalized = toPosix(file);
    return DEPENDENCY_PATH.test(normalized) || generated.has(normalized);
  }
  function isExcluded(file: string): boolean {
    const normalized = toPosix(file);
    return excludeMatchers.some((matcher) => matcher.test(normalized));
  }
  const isTestFile = testFileClassifier(patterns, isRunnerTest);
  function isSourceFile(file: string): boolean {
    const normalized = toPosix(file);
    return (
      patterns.sourcePattern.test(normalized) &&
      !isTestFile(normalized) &&
      !isGeneratedPath(normalized) &&
      !normalized.endsWith('.d.ts') &&
      !isExcluded(normalized)
    );
  }
  return {
    isExcluded,
    isTestFile,
    isFixturePath: (file) => FIXTURE_PATH.test(toPosix(file)),
    isGeneratedPath,
    isTestPath: (file) => patterns.testPattern.test(toPosix(file)),
    isRunnableTestFile: (file) => isTestFile(file) && isRunnerTest(toPosix(file)),
    isRunnerTestFile: (file) => isRunnerTest(toPosix(file)),
    isSourceFile,
    isSourceUnderRoot: sourceUnderRootClassifier({
      sourceRoot: sourceRoots[0] ?? defaultSourceRoots[0],
      isSourceFile,
      isExcluded,
    }),
    ...sourceRootLookups({ sourceRoots, isGeneratedPath, isExcluded }),
    isTestFixture: (file, name = '') => testInput(name).test(toPosix(file)),
  };
}

function exactPathPattern(files: readonly string[]): string | undefined {
  return files.length === 0 ? undefined : `^(?:${files.map(escapeRegExp).join('|')})$`;
}

function rootExcludedGlobs(layout: LayoutOptions): string[] {
  return (layout.sourceRoots ?? []).some((root) => isProjectRoot(normalizeRoot(root)))
    ? [...new Set([...builtInExcludedGlobs, ...PROJECT_ROOT_EXCLUDED_GLOBS])]
    : [];
}

function excludedGlobsFor(layout: LayoutOptions, exclude: readonly string[]): ExcludedGlobs {
  const rootGlobs = rootExcludedGlobs(layout);
  const hiddenGlobs = [
    ...(layout.excludedGlobs ?? []).filter((glob) => !builtInExcludedGlobs.includes(glob)),
    ...rootGlobs,
    ...exclude,
  ];
  return {
    excludedGlobs: [
      ...new Set([...(layout.excludedGlobs ?? builtInExcludedGlobs), ...rootGlobs]),
      ...exclude,
    ],
    hiddenGlobs,
    excludePattern: excludePatternOf(hiddenGlobs),
  };
}

function extensionFacts(javascript: boolean): ExtensionFacts {
  const extensions = javascript ? javascriptProjectExtensionNames : codeExtensionNames;
  return {
    extensions,
    entryExtensions: javascript
      ? [...JAVASCRIPT_EXTENSIONS, ...TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT]
      : ['ts'],
    formatExtensions: javascript ? extensions : typescriptFormatExtensionNames,
  };
}

function rootedFacts(
  layout: LayoutOptions,
  javascript: boolean,
  testFiles: ClassifierInput['testFiles'],
) {
  const sourceRoots = (layout.sourceRoots ?? defaultSourceRoots).map(normalizeRoot);
  const testRoots = (layout.testRoots ?? defaultTestRoots).map(normalizeRoot);
  const extensionFields = extensionFacts(javascript);
  const { extensions } = extensionFields;
  const extensionGlob = `{${extensions.join(',')}}`;
  const colocatedTests = layout.colocatedTests === true;
  const patterns = filePatterns({ sourceRoots, testRoots, extensions, colocatedTests });
  const globs = globsFor({
    sourceRoots,
    testRoots,
    javascript,
    extensionGlob,
    colocatedTests,
    testFiles,
  });
  return {
    sourceRoots,
    testRoots,
    extensionFields,
    extensionGlob,
    colocatedTests,
    patterns,
    globs,
  };
}

export function resolveLayout(
  layout: LayoutOptions = {},
  exclude: readonly string[] = [],
  {
    javascript: requested,
    generatedFiles = [],
    testFiles = defaultTestFiles(undefined),
  }: ResolveOptions = {},
): ResolvedLayout {
  const javascript = requested === true;
  const {
    sourceRoots,
    testRoots,
    extensionFields,
    extensionGlob,
    colocatedTests,
    patterns,
    globs,
  } = rootedFacts(layout, javascript, testFiles);
  const { excludedGlobs, hiddenGlobs, excludePattern } = excludedGlobsFor(layout, exclude);
  const resolved: ResolvedLayout = {
    testFiles,
    javascript,
    colocatedTests,
    ...extensionFields,
    sourceRoots,
    sourceRoot: sourceRoots[0] ?? defaultSourceRoots[0],
    testRoots,
    exclude,
    excludedGlobs,
    runtimeExcludedGlobs: [...excludedGlobs, ...declarationGlobs],
    ...globs,
    hiddenGlobs,
    ...endToEndFor(layout, testRoots, extensionGlob),
    excludePattern,
    generatedFilePattern: exactPathPattern(generatedFiles),
    ...createClassifiers({
      sourceRoots,
      testRoots,
      exclude: hiddenGlobs,
      patterns,
      generatedFiles,
      testFiles,
    }),
    projectCodeFiles: (projectRoot, roots = globs.graphRoots) =>
      codeFilesUnder(resolved, projectRoot, existingRoots(projectRoot, roots)),
  };
  return resolved;
}

export function resolveLayoutFor(policy: LayoutPolicy = {}): PolicyLayout {
  return {
    ...resolveLayout(policy.layout, policy.exclude, {
      ...(isJavascriptPolicy(policy) ? { javascript: true } : {}),
      generatedFiles: policy.generatedFiles,
      testFiles: policyTestFiles(policy.tools?.tests),
    }),
    duplicateSkippedFolders: policy.duplicates?.skippedFolders,
    typescriptProject: policy.tools?.typescript?.project,
    typescriptSettings: policy.tools?.typescript,
  };
}

const defaults = resolveLayout();

export const defaultResolvedLayout = defaults;

export const sourceRoot = defaults.sourceRoot;
export const sourceRoots = defaults.sourceRoots;
export const testRoots = defaults.testRoots;
export const sourceGlobs = defaults.sourceGlobs;
export const testGlobs = defaults.testGlobs;
export const isTestFile = defaults.isTestFile;
export const isSourceFile = defaults.isSourceFile;
