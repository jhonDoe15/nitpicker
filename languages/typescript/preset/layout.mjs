import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp, globToRegExp, globToRegExpSource } from '../../../shared/glob.mjs';
import { isJavascriptPolicy } from '../../javascript/preset/javascript-preset.mjs';

export { globToRegExp };

const defaultSourceRoots = ['src'];
const defaultTestRoots = ['test', 'tests'];
export const codeExtensionNames = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];
export const codeExtensions = `{${codeExtensionNames.join(',')}}`;
export const builtInExcludedGlobs = [
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

export function resolveLayout(layout = {}, exclude = [], { javascript = false } = {}) {
  const sourceRoots = (layout.sourceRoots ?? defaultSourceRoots).map(normalizeRoot);
  const testRoots = (layout.testRoots ?? defaultTestRoots).map(normalizeRoot);
  const sourceRoot = sourceRoots[0] ?? defaultSourceRoots[0];
  const excludedGlobs = [...(layout.excludedGlobs ?? builtInExcludedGlobs), ...exclude];
  const excludeMatchers = exclude.map(globToRegExp);
  const sourceAlternatives = sourceRoots.map(escapeRegExp).join('|');
  const testAlternatives = testRoots.map(escapeRegExp).join('|');
  const testPattern = new RegExp(
    [
      `^(?:${testAlternatives})/`,
      `^(?:${sourceAlternatives})/.*\\.(?:test|spec)\\.[cm]?[jt]sx?$`,
      `^(?:${sourceAlternatives})/(?:.*/)?__tests__/`,
    ]
      .map((pattern) => `(?:${pattern})`)
      .join('|'),
  );
  const sourcePattern = new RegExp(`^(?:${sourceAlternatives})/.*\\.[cm]?[jt]sx?$`);

  const unitTestExtension = javascript ? codeExtensions : 'ts';
  const resolved = {
    javascript,
    entryExtensions: javascript ? ['js', 'mjs', 'cjs'] : ['ts'],
    sourceRoots,
    sourceRoot,
    testRoots,
    exclude,
    excludedGlobs,
    sourceGlobs: sourceRoots.map((root) => `${root}/**/*.${codeExtensions}`),
    testGlobs: [
      ...testRoots.map((root) => `${root}/**/*.${codeExtensions}`),
      ...sourceRoots.map((root) => `${root}/**/*.{test,spec}.${codeExtensions}`),
    ],
    sourceTestDirectoryGlobs: sourceRoots.map((root) => `${root}/**/__tests__/**`),
    unitTestGlobs: [
      ...sourceRoots.map((root) => `${root}/**/__tests__/**/*.${unitTestExtension}`),
      ...testRoots.map((root) => `${root}/unit/**/*.${unitTestExtension}`),
    ],
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
      if (!/\.[cm]?[jt]sx?$/.test(normalized) || normalized.endsWith('.d.ts')) return false;
      return testPattern.test(normalized);
    },
    isRunnableTestFile(file) {
      return resolved.isTestFile(file) && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
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
      function visit(directory, relative) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const name = relative ? `${relative}/${entry.name}` : entry.name;
          if (GENERATED_DIRECTORY.test(name)) continue;
          if (entry.isDirectory()) visit(path.join(directory, entry.name), name);
          else if (entry.isFile() && (resolved.isSourceFile(name) || resolved.isTestFile(name))) {
            if (!resolved.isExcluded(name)) files.push(name);
          }
        }
      }
      for (const root of existingRoots(projectRoot, roots)) {
        visit(path.join(projectRoot, root), root);
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
export const codeGlobs = [...sourceGlobs, ...testGlobs];
export const excludedGlobs = defaults.excludedGlobs;
export const graphRoots = defaults.graphRoots;
export const graphIncludeOnly = defaults.graphIncludeOnly;
export const projectCodeFiles = defaults.projectCodeFiles;
export const isTestFixture = defaults.isTestFixture;
export const isTestFile = defaults.isTestFile;
export const isRunnableTestFile = defaults.isRunnableTestFile;
export const isSourceUnderRoot = defaults.isSourceUnderRoot;
export const isSourceFile = defaults.isSourceFile;
