import { readFileSync } from 'node:fs';
import { groupBy } from './fact-graph.mjs';

export function readMovesFile(movesFile) {
  return movesFile === undefined ? new Map() : new Map(JSON.parse(readFileSync(movesFile, 'utf8')));
}

export function baselinePathsOf({ snapshot, baselineMovesFile }) {
  if (snapshot !== 'head') {
    return new Map();
  }
  return new Map([...readMovesFile(baselineMovesFile)].map(([from, to]) => [to, from]));
}

export function baselineFromFacts(baseFacts, baselinePaths = new Map()) {
  const byFile = groupBy(
    (baseFacts.definitions ?? []).map((definition) => ({
      ...definition,
      text: definition.text ?? definition.tokens.join(' '),
    })),
    ({ file }) => file,
  );
  return (file) => ({
    unchanged: false,
    definitions: byFile.get(baselinePaths.get(file) ?? file) ?? [],
  });
}
