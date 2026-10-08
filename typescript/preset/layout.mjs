import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

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

/** Translates one glob (`**`, `*`, `?`, `{a,b}`) into a regular expression source for `/` paths. */
export function globToRegExpSource(glob) {
  let source = '';
  let braceDepth = 0;
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      const followedBySlash = glob[index + 2] === '/';
      source += followedBySlash ? '(?:.*/)?' : '.*';
      index += followedBySlash ? 2 : 1;
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else if (character === '{') {
      braceDepth += 1;
      source += '(?:';
    } else if (character === '}' && braceDepth > 0) {
      braceDepth -= 1;
      source += ')';
    } else if (character === ',' && braceDepth > 0) {
      source += '|';
    } else {
      source += escapeRegExp(character);
    }
  }
  return `^(?:${source})$`;
}

export function globToRegExp(glob) {
  return new RegExp(globToRegExpSource(glob));
}

function escapeRegExp(value) {
  return value.replace(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

function normalizeRoot(root) {
  return root.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

/**
 * Derives every layout-dependent value from the source roots, test roots and excluded globs.
 * `layout` holds the preset's own settings, `exclude` the project's extra globs from the config
 * file. The result is plain data plus predicates, so each runner resolves it once.
 */
export function resolveLayout(layout = {}, exclude = []) {
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

  const resolved = {
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
      ...sourceRoots.map((root) => `${root}/**/__tests__/**/*.ts`),
      ...testRoots.map((root) => `${root}/unit/**/*.ts`),
    ],
    graphRoots: [...sourceRoots, ...testRoots],
    graphIncludeOnly: `^(${[...sourceRoots, ...testRoots].map(escapeRegExp).join('|')})(?:/|$)`,
    /** Regular expression source for the config file's `exclude` globs, or undefined when empty. */
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
    /** True for production sources below `root`, a directory inside one of the source roots. */
    isSourceUnderRoot(file, root) {
      const normalized = file.replaceAll('\\', '/');
      const prefix = `${root.replaceAll('\\', '/').replace(/\/$/, '')}/`;
      return (
        normalized.startsWith(prefix) &&
        resolved.isSourceFile(`${sourceRoot}/${normalized.slice(prefix.length)}`) &&
        !resolved.isExcluded(normalized)
      );
    },
    /** The source root that contains `file`, matched as a path segment, or undefined. */
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
