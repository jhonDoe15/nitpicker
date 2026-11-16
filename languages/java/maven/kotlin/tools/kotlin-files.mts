import { filesEndingWith } from '../../../../../shared/filesystem.mjs';

const endingWith: (directories: readonly string[], extension: string) => string[] = filesEndingWith;

export const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';

export function kotlinFiles(roots: readonly string[]): string[] {
  return endingWith(roots, '.kt');
}

export function lintedRoots({
  sourceRoots,
  testSourceRoots,
}: {
  readonly sourceRoots: readonly string[];
  readonly testSourceRoots?: readonly string[];
}): string[] {
  return [...new Set([...sourceRoots, ...(testSourceRoots ?? [])])];
}
