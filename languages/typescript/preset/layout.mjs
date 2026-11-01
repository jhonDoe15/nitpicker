import { filePatterns, globsFor } from './layout/path-patterns.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../shared/filesystem.mjs';
import { escapeRegExp, globMatcher, globToRegExpSource } from '../../../shared/paths/glob.mjs';
import {
  isJavascriptPolicy,
  JAVASCRIPT_EXTENSIONS,
  TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT,
} from '../../javascript/preset/javascript-preset.mjs';

export { globMatcher };

const defaultSourceRoots = ['src'];
export const END_TO_END_ROOT = 'e2e';
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
export const DEPENDENCY_PATH_PATTERN = '(?:^|/)node_modules(?:/|$)';
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

function createClassifiers({ sourceRoots, testRoots, exclude, patterns, generatedFiles }) {
  const excludeMatchers = exclude.map(globMatcher);
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
  function isTestFile(file) {
    const normalized = toPosix(file);
    if (!patterns.codePattern.test(normalized) || normalized.endsWith('.d.ts')) return false;
    return patterns.testPattern.test(normalized);
  }
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
    isRunnableTestFile: (file) => isTestFile(file) && patterns.runnableTestPattern.test(file),
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

function exactPathPattern(files) {
  return files.length === 0
    ? undefined
    : `^(?:${files.map((file) => escapeRegExp(file)).join('|')})$`;
}

function endToEndFor(layout, testRoots, extensionGlob) {
  const isRoot = testRoots.includes(END_TO_END_ROOT);
  return {
    executedTestRoots:
      layout.testRoots === undefined
        ? testRoots.filter((root) => root !== END_TO_END_ROOT)
        : testRoots,
    endToEndGlobs: isRoot ? [`${END_TO_END_ROOT}/**/*.${extensionGlob}`] : [],
    isEndToEndTest: (file) =>
      isRoot && file.replaceAll('\\', '/').startsWith(`${END_TO_END_ROOT}/`),
  };
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

export function resolveLayout(
  layout = {},
  exclude = [],
  { javascript = false, generatedFiles = [] } = {},
) {
  const sourceRoots = (layout.sourceRoots ?? defaultSourceRoots).map(normalizeRoot);
  const testRoots = (layout.testRoots ?? defaultTestRoots).map(normalizeRoot);
  const extensions = javascript ? javascriptProjectExtensionNames : codeExtensionNames;
  const extensionGlob = `{${extensions.join(',')}}`;
  const colocatedTests = layout.colocatedTests === true;
  const patterns = filePatterns({ sourceRoots, testRoots, extensions, colocatedTests });
  const globs = globsFor({ sourceRoots, testRoots, javascript, extensionGlob, colocatedTests });
  const { excludedGlobs, hiddenGlobs } = excludedGlobsFor(layout, exclude);
  const resolved = {
    javascript,
    colocatedTests,
    extensions,
    entryExtensions: javascript
      ? [...JAVASCRIPT_EXTENSIONS, ...TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT]
      : ['ts'],
    formatExtensions: javascript ? extensions : typescriptFormatExtensionNames,
    sourceRoots,
    sourceRoot: sourceRoots[0] ?? defaultSourceRoots[0],
    testRoots,
    exclude,
    excludedGlobs,
    runtimeExcludedGlobs: [...excludedGlobs, ...declarationGlobs],
    ...globs,
    hiddenGlobs,
    ...endToEndFor(layout, testRoots, extensionGlob),
    excludePattern:
      hiddenGlobs.length === 0
        ? undefined
        : hiddenGlobs.map((glob) => globToRegExpSource(glob)).join('|'),
    generatedFilePattern: exactPathPattern(generatedFiles),
    ...createClassifiers({
      sourceRoots,
      testRoots,
      exclude: hiddenGlobs,
      patterns,
      generatedFiles,
    }),
    projectCodeFiles: (projectRoot, roots = globs.graphRoots) =>
      codeFilesUnder(resolved, projectRoot, existingRoots(projectRoot, roots)),
  };
  return resolved;
}

function codeFilesUnder(layout, projectRoot, roots) {
  return roots.flatMap((root) => codeFilesUnderRoot(layout, projectRoot, root).toSorted());
}

function codeFilesUnderRoot(layout, projectRoot, root) {
  function relativeOf(absolute) {
    return toPosix(path.relative(projectRoot, absolute));
  }
  return [
    ...filesUnder(path.join(projectRoot, root), {
      skipDirectory: (absolute) => DEPENDENCY_PATH.test(relativeOf(absolute)),
    }),
  ]
    .map(relativeOf)
    .filter((name) => !layout.isGeneratedPath(name) && isCodeFile(layout, name));
}

function isCodeFile(layout, name) {
  return (layout.isSourceFile(name) || layout.isTestFile(name)) && !layout.isExcluded(name);
}

export function existingRoots(projectRoot, roots) {
  return roots.filter((root) => existsSync(path.join(projectRoot, root)));
}

export function resolveLayoutFor(policy = {}) {
  return {
    ...resolveLayout(policy.layout, policy.exclude, {
      javascript: isJavascriptPolicy(policy),
      generatedFiles: policy.generatedFiles,
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
