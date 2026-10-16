import { readFileSync } from 'node:fs';

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
  const byFile = new Map();
  for (const definition of baseFacts.definitions ?? []) {
    const text = definition.text ?? definition.tokens.join(' ');
    byFile.set(definition.file, [...(byFile.get(definition.file) ?? []), { ...definition, text }]);
  }
  return (file) => ({
    unchanged: false,
    definitions: byFile.get(baselinePaths.get(file) ?? file) ?? [],
  });
}
