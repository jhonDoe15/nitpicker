import path from 'node:path';
import { globMatcher } from '../../../../shared/paths/glob.mts';
import type { SourcePatterns } from './compiler-types.mts';

const ALL_JAVA = ['**/*.java'];

function antGlob(pattern: string): string {
  const slashed = pattern.replaceAll('\\', '/');
  return slashed.endsWith('/') ? `${slashed}**` : slashed;
}

function matchesAny(patterns: readonly string[], relative: string): boolean {
  return patterns.some((pattern) => globMatcher(antGlob(pattern)).test(relative));
}

function underRoot(roots: readonly string[], file: string): string | undefined {
  return roots
    .map((root) => path.relative(root, file).replaceAll(path.sep, '/'))
    .find(
      (relative) => relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative),
    );
}

export function selectedSources(
  roots: readonly string[],
  files: readonly string[],
  patterns: SourcePatterns | undefined,
): string[] {
  if (patterns === undefined) {
    return [...files];
  }
  const includes = patterns.includes.length === 0 ? ALL_JAVA : patterns.includes;
  return files.filter((file) => {
    const relative = underRoot(roots, file);
    return (
      relative !== undefined &&
      matchesAny(includes, relative) &&
      !matchesAny(patterns.excludes, relative)
    );
  });
}
