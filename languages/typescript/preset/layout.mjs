import { existsSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../shared/filesystem.mjs';
import { escapeRegExp, globToRegExp, globToRegExpSource } from '../../../shared/glob.mjs';
import {
  isJavascriptPolicy,
  JAVASCRIPT_EXTENSIONS,
  TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT,
} from '../../javascript/preset/javascript-preset.mjs';

export { globToRegExp };

const defaultSourceRoots = ['src'];
const defaultTestRoots = ['test', 'tests'];
export const codeExtensionNames = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];
export const codeExtensions = `{${codeExtensionNames.join(',')}}`;
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
export const DEPENDENCY_PATH_PATTERN = '(?:^|/)node_modules(?:/|$)';
export const GENERATED_CODE_PATTERN = '^generated/';
export const EXCLUDED_PATH_PATTERN = `^(?:${ROOT_OUTPUT_FOLDERS.join('|')})(?:/|$)|${DEPENDENCY_PATH_PATTERN}`;
const GENERATED_NAME = '(?:^|/)__generated__(?:/|$)|(?:\\.(?:generated|gen|pb)|_pb)\\.[^/]+$';
const GENERATED_PATH = new RegExp(`${EXCLUDED_PATH_PATTERN}|${GENERATED_NAME}`);

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
  return {
    testPattern,
    sourcePattern,
    codePattern: new RegExp(`\\.${suffix}`),
    runnableTestPattern: new RegExp(`\\.(?:test|spec)\\.${suffix}`),
  };
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

function createClassifiers({ sourceRoots, testRoots, exclude, patterns }) {
  const excludeMatchers = exclude.map(globToRegExp);
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
    isRunnableTestFile: (file) => isTestFile(file) && patterns.runnableTestPattern.test(file),
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

function globsFor({ sourceRoots, testRoots, javascript, extensionGlob }) {
  return {
    sourceGlobs: sourceRoots.map((root) => `${root}/**/*.${extensionGlob}`),
    testGlobs: [
      ...testRoots.map((root) => `${root}/**/*.${extensionGlob}`),
      ...sourceRoots.map((root) => `${root}/**/*.{test,spec}.${extensionGlob}`),
    ],
    sourceTestDirectoryGlobs: sourceRoots.map((root) => `${root}/**/__tests__/**`),
    unitTestGlobs: unitTestGlobsFor({ sourceRoots, testRoots, javascript, extensionGlob }),
    graphRoots: [...sourceRoots, ...testRoots],
    graphIncludeOnly: `^(${[...sourceRoots, ...testRoots].map(escapeRegExp).join('|')})(?:/|$)`,
  };
}

export function resolveLayout(layout = {}, exclude = [], { javascript = false } = {}) {
  const sourceRoots = (layout.sourceRoots ?? defaultSourceRoots).map(normalizeRoot);
  const testRoots = (layout.testRoots ?? defaultTestRoots).map(normalizeRoot);
  const extensions = javascript ? javascriptProjectExtensionNames : codeExtensionNames;
  const extensionGlob = `{${extensions.join(',')}}`;
  const patterns = filePatterns({ sourceRoots, testRoots, extensions });
  const globs = globsFor({ sourceRoots, testRoots, javascript, extensionGlob });
  const excludedGlobs = [...(layout.excludedGlobs ?? builtInExcludedGlobs), ...exclude];
  const hiddenGlobs = [
    ...(layout.excludedGlobs ?? []).filter((glob) => !builtInExcludedGlobs.includes(glob)),
    ...exclude,
  ];
  const resolved = {
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
    excludedGlobs,
    runtimeExcludedGlobs: [...excludedGlobs, ...declarationGlobs],
    ...globs,
    excludePattern:
      hiddenGlobs.length === 0
        ? undefined
        : hiddenGlobs.map((glob) => globToRegExpSource(glob)).join('|'),
    ...createClassifiers({ sourceRoots, testRoots, exclude: hiddenGlobs, patterns }),
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
      skipDirectory: (absolute) => GENERATED_PATH.test(relativeOf(absolute)),
    }),
  ]
    .map(relativeOf)
    .filter((name) => !GENERATED_PATH.test(name) && isCodeFile(layout, name));
}

function isCodeFile(layout, name) {
  return (layout.isSourceFile(name) || layout.isTestFile(name)) && !layout.isExcluded(name);
}

export function existingRoots(projectRoot, roots) {
  return roots.filter((root) => existsSync(path.join(projectRoot, root)));
}

export function resolveLayoutFor(policy = {}) {
  return resolveLayout(policy.layout, policy.exclude, { javascript: isJavascriptPolicy(policy) });
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
