import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const sourceRoot = 'src';
export const sourceRoots = [sourceRoot];
export const testRoots = ['test', 'tests'];
export const codeExtensionNames = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];
export const codeExtensions = `{${codeExtensionNames.join(',')}}`;
export const sourceGlobs = [`src/**/*.${codeExtensions}`];
export const testGlobs = [
  ...testRoots.map((root) => `${root}/**/*.${codeExtensions}`),
  `src/**/*.{test,spec}.${codeExtensions}`,
];
export const codeGlobs = [...sourceGlobs, ...testGlobs];
export const excludedGlobs = [
  '**/dist/**',
  '**/build/**',
  '**/generated/**',
  '**/node_modules/**',
  '**/coverage/**',
  '**/reports/**',
  '**/target/**',
  '**/*.d.ts',
];
/** Source, test and excluded globs for a layout; the preset defaults apply to omitted keys. */
export function layoutGlobs({
  sourceRoots: sources = sourceRoots,
  testRoots: tests = testRoots,
  excludedGlobs: excluded = excludedGlobs,
} = {}) {
  return {
    sourceGlobs: sources.map((root) => `${root}/**/*.${codeExtensions}`),
    testGlobs: [
      ...tests.map((root) => `${root}/**/*.${codeExtensions}`),
      ...sources.map((root) => `${root}/**/*.{test,spec}.${codeExtensions}`),
    ],
    excludedGlobs: excluded,
  };
}

export const graphRoots = [...sourceRoots, ...testRoots];
export const graphIncludeOnly = '^(src|test|tests)(?:/|$)';

export function existingRoots(projectRoot, roots) {
  return roots.filter((root) => existsSync(path.join(projectRoot, root)));
}

export function projectCodeFiles(projectRoot, roots = graphRoots) {
  const files = [];
  function visit(directory, relative) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (
        /(?:^|\/)(?:dist|build|generated|node_modules|coverage|reports|target)(?:\/|$)/.test(name)
      )
        continue;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), name);
      else if (entry.isFile() && (isSourceFile(name) || isTestFile(name))) files.push(name);
    }
  }
  for (const root of existingRoots(projectRoot, roots)) visit(path.join(projectRoot, root), root);
  return files;
}

export function isTestFixture(file, name = '') {
  const normalized = file.replaceAll('\\', '/');
  return testRoots.some((root) => normalized.includes(`/${root}/fixtures/${name}`));
}

export function isTestFile(file) {
  const normalized = file.replaceAll('\\', '/');
  if (!/\.[cm]?[jt]sx?$/.test(normalized) || normalized.endsWith('.d.ts')) return false;
  return (
    /^(?:test|tests)\//.test(normalized) ||
    /^src\/.*\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    /^src\/(?:.*\/)?__tests__\//.test(normalized)
  );
}

export function isRunnableTestFile(file) {
  return isTestFile(file) && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

export function isSourceUnderRoot(file, root) {
  const normalized = file.replaceAll('\\', '/');
  const prefix = `${root.replaceAll('\\', '/').replace(/\/$/, '')}/`;
  return normalized.startsWith(prefix) && isSourceFile(`src/${normalized.slice(prefix.length)}`);
}

export function isSourceFile(file) {
  const normalized = file.replaceAll('\\', '/');
  return (
    /^src\/.*\.[cm]?[jt]sx?$/.test(normalized) &&
    !isTestFile(normalized) &&
    !/(?:^|\/)(?:dist|build|generated|node_modules|coverage|reports|target)(?:\/|$)/.test(
      normalized,
    ) &&
    !normalized.endsWith('.d.ts')
  );
}
