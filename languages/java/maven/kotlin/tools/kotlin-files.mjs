import { filesEndingWith } from '../../../../../shared/filesystem.mjs';

export const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';

export function kotlinFiles(roots) {
  return filesEndingWith(roots, '.kt');
}

export function lintedRoots({ sourceRoots, testSourceRoots = [] }) {
  return [...new Set([...sourceRoots, ...testSourceRoots])];
}
