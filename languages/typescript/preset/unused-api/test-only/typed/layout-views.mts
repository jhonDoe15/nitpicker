import { globMatcher as untypedGlobMatcher, toPosix as untypedToPosix } from '../../../layout.mjs';

export type ProductionLayout = {
  readonly testRoots: readonly string[];
  readonly testGlobs: readonly string[];
  readonly sourceTestDirectoryGlobs: readonly string[];
};

export const globMatcher: (glob: string) => { test: (file: string) => boolean } =
  untypedGlobMatcher;

export const toPosix: (file: string) => string = untypedToPosix;
