import path from 'node:path';
import { goUnits } from './go-units.mjs';
import { topLevelNames } from './file-scope.mjs';

function packageScopes(parser, sources) {
  const scopes = new Map();
  for (const { file, text } of sources) {
    const tree = parser.parse(text);
    if (tree !== null) {
      const directory = path.posix.dirname(file);
      scopes.set(
        directory,
        new Set([...(scopes.get(directory) ?? []), ...topLevelNames(tree.rootNode)]),
      );
      tree.delete();
    }
  }
  return scopes;
}

function unitsOfSource(parser, { file, text }, scopes) {
  const tree = parser.parse(text);
  if (tree === null) {
    return [];
  }
  try {
    return goUnits(tree.rootNode, file, scopes.get(path.posix.dirname(file)) ?? new Set());
  } finally {
    tree.delete();
  }
}

export function goProjectUnits(parser, sources) {
  const scopes = packageScopes(parser, sources);
  return sources.flatMap((source) => unitsOfSource(parser, source, scopes));
}
