import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp, globToRegExp, globToRegExpSource } from '../../../shared/glob.mjs';
import {
  isJavascriptPolicy,
  JAVASCRIPT_EXTENSIONS,
  TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT,
} from '../../javascript/preset/javascript-preset.mjs';
import {
  defaultTestFiles,
  escapedGlob,
  policyTestFiles,
  rootScopedGlobs,
  sourceRootGlobs,
  testFileMatcher,
} from './test-runner/test-files/test-file-patterns.mjs';

export { globToRegExp };

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
const builtInExcludedGlobs = [
  '**/dist/**',
  '**/build/**',
  '**/generated/**',
  '**/node_modules/**',
  '**/coverage/**',
  '**/reports/**',
  '**/target/**',
  '**/*.d.ts',
];
const GENERATED_PATH = new RegExp(
  [
    '(?:^|/)(?:dist|build|generated|__generated__|node_modules|coverage|reports|target)(?:/|$)',
    '(?:\\.(?:generated|gen|pb)|_pb)\\.[^/]+$',
  ].join('|'),
);

function normalizeRoot(root) {
  return root.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function filePatterns({ sourceRoots, testRoots, extensions }) {
  const sourceAlternatives = sourceRoots.map(escapeRegExp).join('|');
  const testAlternatives = testRoots.map(escapeRegExp).join('|');
  const suffix = `(?:${extensions.join('|')})$`;
  const testPattern = new RegExp(
    [
      `^(?:${testAlternatives})/`,
      `^(?:${sourceAlternatives})/.*\\.(?:test|spec)\\.${suffix}`,
      `^(?:${sourceAlternatives})/(?:.*/)?__tests__/`,
    ]
      .map((pattern) => `(?:${pattern})`)
      .join('|'),
  );
  const sourcePattern = new RegExp(`^(?:${sourceAlternatives})/.*\\.${suffix}`);
  return { testPattern, sourcePattern, codePattern: new RegExp(`\\.${suffix}`) };
}

function unitTestGlobsFor({ sourceRoots, testRoots, javascript, extensionGlob }) {
  const extension = javascript ? extensionGlob : 'ts';
  return [
    ...sourceRoots.map((root) => `${root}/**/__tests__/**/*.${extension}`),
    ...testRoots.map((root) => `${root}/unit/**/*.${extension}`),
  ];
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

function createClassifiers({ sourceRoots, testRoots, exclude, patterns, testFiles }) {
  const excludeMatchers = exclude.map(globToRegExp);
  const isRunnerTest = testFileMatcher(testFiles);
  function isExcluded(file) {
    const normalized = toPosix(file);
    return excludeMatchers.some((matcher) => matcher.test(normalized));
  }
  function isTestFile(file) {
    const normalized = toPosix(file);
    if (!patterns.codePattern.test(normalized) || normalized.endsWith('.d.ts')) {
      return false;
    }
    if (patterns.testPattern.test(normalized)) {
      return true;
    }
    return patterns.sourcePattern.test(normalized) && isRunnerTest(normalized);
  }
  function isSourceFile(file) {
    const normalized = toPosix(file);
    return (
      patterns.sourcePattern.test(normalized) &&
      !isTestFile(normalized) &&
      !GENERATED_PATH.test(normalized) &&
      !normalized.endsWith('.d.ts') &&
      !isExcluded(normalized)
    );
  }
  return {
    isExcluded,
    isTestFile,
    isGeneratedPath: (file) => GENERATED_PATH.test(toPosix(file)),
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
    isTestFixture: (file, name = '') => {
      const normalized = toPosix(file);
      return (
        normalized.includes(`/__tests__/fixtures/${name}`) ||
        testRoots.some((root) => normalized.includes(`/${root}/fixtures/${name}`))
      );
    },
  };
}

function globsFor({ sourceRoots, testRoots, javascript, extensionGlob, testFiles }) {
  return {
    sourceGlobs: sourceRoots.map((root) => `${root}/**/*.${extensionGlob}`),
    testGlobs: [
      ...testRoots.map((root) => `${root}/**/*.${extensionGlob}`),
      ...sourceRoots.map((root) => `${root}/**/*.{test,spec}.${extensionGlob}`),
      ...sourceRootGlobs(sourceRoots, testFiles),
    ],
    runnerSourceTestGlobs: sourceRootGlobs(sourceRoots, testFiles),
    runnableTestGlobs: rootScopedGlobs([...sourceRoots, ...testRoots], testFiles.include),
    sourceTestDirectoryGlobs: sourceRoots.map((root) => `${root}/**/__tests__/**`),
    unitTestGlobs: unitTestGlobsFor({ sourceRoots, testRoots, javascript, extensionGlob }),
    graphRoots: [...sourceRoots, ...testRoots],
    graphIncludeOnly: `^(${[...sourceRoots, ...testRoots].map(escapeRegExp).join('|')})(?:/|$)`,
  };
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

export function resolveLayout(
  layout = {},
  exclude = [],
  { javascript = false, testFiles = defaultTestFiles() } = {},
) {
  const sourceRoots = (layout.sourceRoots ?? defaultSourceRoots).map(normalizeRoot);
  const testRoots = (layout.testRoots ?? defaultTestRoots).map(normalizeRoot);
  const extensions = javascript ? javascriptProjectExtensionNames : codeExtensionNames;
  const extensionGlob = `{${extensions.join(',')}}`;
  const patterns = filePatterns({ sourceRoots, testRoots, extensions });
  const globs = globsFor({ sourceRoots, testRoots, javascript, extensionGlob, testFiles });
  const resolved = {
    testFiles,
    javascript,
    extensions,
    entryExtensions: javascript
      ? [...JAVASCRIPT_EXTENSIONS, ...TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT]
      : ['ts'],
    formatExtensions: javascript ? extensions : typescriptFormatExtensionNames,
    sourceRoots,
    sourceRoot: sourceRoots[0] ?? defaultSourceRoots[0],
    testRoots,
    exclude,
    excludedGlobs: [...(layout.excludedGlobs ?? builtInExcludedGlobs), ...exclude],
    ...globs,
    ...endToEndFor(layout, testRoots, extensionGlob),
    excludePattern:
      exclude.length === 0 ? undefined : exclude.map((glob) => globToRegExpSource(glob)).join('|'),
    ...createClassifiers({ sourceRoots, testRoots, exclude, patterns, testFiles }),
    projectCodeFiles: (projectRoot, roots = globs.graphRoots) =>
      codeFilesUnder(resolved, projectRoot, existingRoots(projectRoot, roots)),
  };
  return resolved;
}

function codeFilesUnder(layout, projectRoot, roots) {
  return roots.flatMap((root) => codeFilesUnderRoot(layout, projectRoot, root).toSorted());
}

function codeFilesUnderRoot(layout, projectRoot, root) {
  const files = [];
  const pending = [root];
  for (const relative of pending) {
    const entries = readdirSync(path.join(projectRoot, relative), { withFileTypes: true })
      .map((entry) => ({ entry, name: relative ? `${relative}/${entry.name}` : entry.name }))
      .filter(({ name }) => !GENERATED_PATH.test(name));
    pending.push(...entries.filter(({ entry }) => entry.isDirectory()).map(({ name }) => name));
    files.push(...entries.filter((item) => isCodeFile(layout, item)).map(({ name }) => name));
  }
  return files;
}

function isCodeFile(layout, { entry, name }) {
  return (
    entry.isFile() &&
    (layout.isSourceFile(name) || layout.isTestFile(name)) &&
    !layout.isExcluded(name)
  );
}

export function existingRoots(projectRoot, roots) {
  return roots.filter((root) => existsSync(path.join(projectRoot, root)));
}

export function resolveLayoutFor(policy = {}) {
  return resolveLayout(policy.layout, policy.exclude, {
    javascript: isJavascriptPolicy(policy),
    testFiles: policyTestFiles(policy.tools?.tests),
  });
}

export function withRunnerTestPaths(layout, projectRoot) {
  if (layout.testFiles.includeRegexes.length === 0) {
    return layout;
  }
  const paths = layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isRunnableTestFile(file))
    .map(escapedGlob);
  return {
    ...layout,
    testGlobs: [...layout.testGlobs, ...paths],
    runnableTestGlobs: [...layout.runnableTestGlobs, ...paths],
  };
}

const defaults = resolveLayout();

export const defaultResolvedLayout = defaults;

export const sourceRoot = defaults.sourceRoot;
export const sourceRoots = defaults.sourceRoots;
export const testRoots = defaults.testRoots;
export const sourceGlobs = defaults.sourceGlobs;
export const testGlobs = defaults.testGlobs;
export const excludedGlobs = defaults.excludedGlobs;
export const isTestFile = defaults.isTestFile;
export const isSourceFile = defaults.isSourceFile;
