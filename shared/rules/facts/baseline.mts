import { readFileSync } from 'node:fs';
import { messageOf, textOf } from '../../values/readers.mts';
import { groupBy } from './fact-graph.mts';
import type { BaselineFile, BaselineSource, FactDefinition } from './typed/fact-types.mts';

function movePair(entry: unknown): [string, string] {
  if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string') {
    return [entry[0], entry[1]];
  }
  throw new TypeError('moves file entries must be [from, to] pairs');
}

function parsedMoves(movesFile: string): unknown {
  try {
    return JSON.parse(readFileSync(movesFile, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read moves file ${movesFile}: ${messageOf(error)}`, { cause: error });
  }
}

export function readMovesFile(movesFile: unknown): Map<string, string> {
  if (movesFile === undefined) {
    return new Map();
  }
  const moves = parsedMoves(textOf(movesFile));
  if (moves === null) {
    return new Map();
  }
  if (!Array.isArray(moves)) {
    throw new TypeError('moves file must hold a list of [from, to] pairs');
  }
  return new Map(moves.map(movePair));
}

export function baselinePathsOf({
  snapshot,
  baselineMovesFile,
}: {
  readonly snapshot?: unknown;
  readonly baselineMovesFile?: unknown;
}): Map<string, string> {
  if (snapshot !== 'head') {
    return new Map();
  }
  return new Map([...readMovesFile(baselineMovesFile)].map(([from, to]) => [to, from]));
}

export function baselineFromFacts(
  baseFacts: { readonly definitions?: readonly FactDefinition[] },
  baselinePaths: ReadonlyMap<string, string> = new Map(),
): BaselineSource {
  const byFile = groupBy(
    (baseFacts.definitions ?? []).map((definition) => ({
      ...definition,
      text: definition.text ?? definition.tokens.join(' '),
    })),
    ({ file }) => file,
  );
  return (file: string): BaselineFile => ({
    unchanged: false,
    definitions: byFile.get(baselinePaths.get(file) ?? file) ?? [],
  });
}
