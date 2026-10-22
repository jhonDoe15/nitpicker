import { filePatterns, globsFor } from './layout/path-patterns.mjs';
import { END_TO_END_ROOT, endToEndFor } from './layout/end-to-end.mjs';
import {
  codeFilesUnder,
  existingRoots,
  DEPENDENCY_PATH_PATTERN,
} from './layout/code-files/project-code-files.mjs';
export { existingRoots, DEPENDENCY_PATH_PATTERN } from './layout/code-files/project-code-files.mjs';
import { escapeRegExp, globMatcher, globToRegExpSource } from '../../../shared/paths/glob.mjs';
import {
  isJavascriptPolicy,
  JAVASCRIPT_EXTENSIONS,
  TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT,
} from '../../javascript/preset/javascript-preset.mjs';
import {
  defaultTestFiles,
  policyTestFiles,
  testFileMatcher,
} from './test-runner/test-files/test-file-patterns.mjs';

export { globMatcher };

const defaultSourceRoots = ['src'];
export { END_TO_END_ROOT } from './layout/end-to-end.mjs';
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
const ROOT_OUTPUT_FOLDERS = ['dist', 'build', 'generated', 'coverage', 'reports', 'target'];
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

export function mayBeGenerated(file) {
  return GENERATED_CANDIDATE.test(toPosix(file)) && !DEPENDENCY_PATH.test(toPosix(file));
}

export const FIXTURE_PATH = /(?:^|\/)(?:fixtures|__fixtures__)\//;

export function prettierPatterns(layout) {
  const code = layout.formatExtensions.join(',');
  return [
    ...layout.sourceRoots.map((root) => `${root}/**/*.{${code},json,yaml,yml}`),
    ...layout.testRoots.map((root) => `${root}/**/*.{${code},json}`),
    `*.{${code},json}`,
  ];
}

function normalizeRoot(root) {
  return root.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

export function toPosix(file) {
  return file.replaceAll('\\', '/');
}

function sourceUnderRootClassifier({ sourceRoot, isSourceFile, isExcluded }) {
  return (file, root) => {
    const normalized = toPosix(file);
    const prefix = `${toPosix(root).replace(/\/$/, '')}/`;
    return (
      normalized.startsWith(prefix) &&
      isSourceFile(`${sourceRoot}/${normalized.slice(prefix.length)}`) &&
      !isExcluded(normalized)
    );
  };
}

function testInputPattern(testRoots) {
  const locations = ['__tests__', ...testRoots].map(escapeRegExp).join('|');
  return (name) =>
    new RegExp(`(?:^|/)(?:${locations})/(?:.*/)?(?:__fixtures__|fixtures)/${escapeRegExp(name)}`);
}

function testFileClassifier(patterns, isRunnerTest) {
  return (file) => {
    const normalized = toPosix(file);
    if (!patterns.codePattern.test(normalized) || normalized.endsWith('.d.ts')) {
      return false;
    }
    return (
      patterns.testPattern.test(normalized) ||
      (patterns.sourcePattern.test(normalized) && isRunnerTest(normalized))
    );
  };
}

function createClassifiers({
  sourceRoots,
  testRoots,
  exclude,
  patterns,
  generatedFiles,
  testFiles,
}) {
  const excludeMatchers = exclude.map(globMatcher);
  const isRunnerTest = testFileMatcher(testFiles);
  const generated = new Set(generatedFiles);
  const testInput = testInputPattern(testRoots);
  function isGeneratedPath(file) {
    const normalized = toPosix(file);
    return DEPENDENCY_PATH.test(normalized) || generated.has(normalized);
  }
  function isExcluded(file) {
    const normalized = toPosix(file);
    return excludeMatchers.some((matcher) => matcher.test(normalized));
  }
  const isTestFile = testFileClassifier(patterns, isRunnerTest);
  function isSourceFile(file) {
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
    sourceRootOf: (file) => sourceRoots.find((root) => file.includes(`/${root}/`)),
    isTestFixture: (file, name = '') => testInput(name).test(toPosix(file)),
  };
}

function globsPattern(globs) {
  return globs.length === 0 ? undefined : globs.map((glob) => globToRegExpSource(glob)).join('|');
}

function exactPathPattern(files) {
  return files.length === 0
    ? undefined
    : `^(?:${files.map((file) => escapeRegExp(file)).join('|')})$`;
}

function excludedGlobsFor(layout, exclude) {
  return {
    excludedGlobs: [...(layout.excludedGlobs ?? builtInExcludedGlobs), ...exclude],
    hiddenGlobs: [
      ...(layout.excludedGlobs ?? []).filter((glob) => !builtInExcludedGlobs.includes(glob)),
      ...exclude,
    ],
  };
}

function extensionFacts(javascript) {
  const extensions = javascript ? javascriptProjectExtensionNames : codeExtensionNames;
  return {
    extensions,
    entryExtensions: javascript
      ? [...JAVASCRIPT_EXTENSIONS, ...TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT]
      : ['ts'],
    formatExtensions: javascript ? extensions : typescriptFormatExtensionNames,
  };
}

export function resolveLayout(
  layout = {},
  exclude = [],
  { javascript = false, generatedFiles = [], testFiles = defaultTestFiles() } = {},
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
  const { excludedGlobs, hiddenGlobs } = excludedGlobsFor(layout, exclude);
  const resolved = {
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
    excludePattern: globsPattern(hiddenGlobs),
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

export function resolveLayoutFor(policy = {}) {
  return {
    ...resolveLayout(policy.layout, policy.exclude, {
      javascript: isJavascriptPolicy(policy),
      generatedFiles: policy.generatedFiles,
      testFiles: policyTestFiles(policy.tools?.tests),
    }),
    duplicateSkippedFolders: policy.duplicates?.skippedFolders,
    typescriptProject: policy.tools?.typescript?.project,
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
