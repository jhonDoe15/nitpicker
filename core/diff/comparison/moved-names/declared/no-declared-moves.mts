import type { DeclaredMoves } from './move-types.mts';

export const NO_DECLARED: DeclaredMoves = {
  names: new Map<string, string>(),
  bare: new Map<string, readonly [string, string]>(),
  filePackages: new Map<string, Map<string, string>>(),
  covered: new Set<string>(),
  folders: new Map<string, string>(),
  packageDirs: new Set<string>(),
};
