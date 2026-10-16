import { readMovesFile } from '../../../../core/diff/git/patches/moves-file.mjs';

export function baselinePathsOf({ snapshot, baselineMovesFile }) {
  if (snapshot !== 'head') return new Map();
  return new Map([...readMovesFile(baselineMovesFile)].map(([from, to]) => [to, from]));
}
