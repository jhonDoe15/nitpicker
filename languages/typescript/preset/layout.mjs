import { filesUnder } from '../../../shared/filesystem.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
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
const GENERATED_DIRECTORY =
  /(?:^|\/)(?:dist|build|generated|node_modules|coverage|reports|target)(?:\/|$)/;

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

export function resolveLayout(layout = {}, exclude = [], { javascript = false } = {}) {
  const sourceRoots = (layout.sourceRoots ?? defaultSourceRoots).map(normalizeRoot);
  const testRoots = (layout.testRoots ?? defaultTestRoots).map(normalizeRoot);
  const sourceRoot = sourceRoots[0] ?? defaultSourceRoots[0];
  const excludedGlobs = [...(layout.excludedGlobs ?? builtInExcludedGlobs), ...exclude];
  const excludeMatchers = exclude.map(globToRegExp);
  const extensions = javascript ? javascriptProjectExtensionNames : codeExtensionNames;
  const extensionGlob = `{${extensions.join(',')}}`;
  const { testPattern, sourcePattern, codePattern, runnableTestPattern } = filePatterns({
    sourceRoots,
    testRoots,
    extensions,
  });
  const resolved = {
    javascript,
    extensions,
    entryExtensions: javascript
      ? [...JAVASCRIPT_EXTENSIONS, ...TYPESCRIPT_EXTENSIONS_IN_JAVASCRIPT_PROJECT]
      : ['ts'],
    formatExtensions: javascript ? extensions : typescriptFormatExtensionNames,
    sourceRoots,
    sourceRoot,
    testRoots,
    exclude,
    excludedGlobs,
    sourceGlobs: sourceRoots.map((root) => `${root}/**/*.${extensionGlob}`),
    testGlobs: [
      ...testRoots.map((root) => `${root}/**/*.${extensionGlob}`),
      ...sourceRoots.map((root) => `${root}/**/*.{test,spec}.${extensionGlob}`),
    ],
    sourceTestDirectoryGlobs: sourceRoots.map((root) => `${root}/**/__tests__/**`),
    unitTestGlobs: unitTestGlobsFor({ sourceRoots, testRoots, javascript, extensionGlob }),
    graphRoots: [...sourceRoots, ...testRoots],
    graphIncludeOnly: `^(${[...sourceRoots, ...testRoots].map(escapeRegExp).join('|')})(?:/|$)`,
    excludePattern:
      exclude.length === 0 ? undefined : exclude.map((glob) => globToRegExpSource(glob)).join('|'),
    isExcluded(file) {
      const normalized = file.replaceAll('\\', '/');
      return excludeMatchers.some((matcher) => matcher.test(normalized));
    },
    isTestFile(file) {
      const normalized = file.replaceAll('\\', '/');
      if (!codePattern.test(normalized) || normalized.endsWith('.d.ts')) return false;
      return testPattern.test(normalized);
    },
    isRunnableTestFile(file) {
      return resolved.isTestFile(file) && runnableTestPattern.test(file);
    },
    isSourceFile(file) {
      const normalized = file.replaceAll('\\', '/');
      return (
        sourcePattern.test(normalized) &&
        !resolved.isTestFile(normalized) &&
        !GENERATED_DIRECTORY.test(normalized) &&
        !normalized.endsWith('.d.ts') &&
        !resolved.isExcluded(normalized)
      );
    },
    isSourceUnderRoot(file, root) {
      const normalized = file.replaceAll('\\', '/');
      const prefix = `${root.replaceAll('\\', '/').replace(/\/$/, '')}/`;
      return (
        normalized.startsWith(prefix) &&
        resolved.isSourceFile(`${sourceRoot}/${normalized.slice(prefix.length)}`) &&
        !resolved.isExcluded(normalized)
      );
    },
    sourceRootOf(file) {
      return sourceRoots.find((root) => file.includes(`/${root}/`));
    },
    isTestFixture(file, name = '') {
      const normalized = file.replaceAll('\\', '/');
      return testRoots.some((root) => normalized.includes(`/${root}/fixtures/${name}`));
    },
    projectCodeFiles(projectRoot, roots = resolved.graphRoots) {
      const files = [];
      for (const root of existingRoots(projectRoot, roots)) {
        function skipDirectory(absolute) {
          return GENERATED_DIRECTORY.test(
            path.relative(projectRoot, absolute).replaceAll('\\', '/'),
          );
        }
        for (const absolute of filesUnder(path.join(projectRoot, root), { skipDirectory })) {
          const name = path.relative(projectRoot, absolute).replaceAll('\\', '/');
          if (
            !GENERATED_DIRECTORY.test(name) &&
            (resolved.isSourceFile(name) || resolved.isTestFile(name)) &&
            !resolved.isExcluded(name)
          )
            files.push(name);
        }
      }
      return files;
    },
  };
  return resolved;
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
export const excludedGlobs = defaults.excludedGlobs;
export const isTestFile = defaults.isTestFile;
export const isSourceFile = defaults.isSourceFile;
