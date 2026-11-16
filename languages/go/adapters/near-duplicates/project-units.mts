import path from 'node:path';
import type { Parser } from 'web-tree-sitter';
import { goUnits } from './go-units.mts';
import { topLevelNames } from './file-scope.mts';
import type { GoSource, GoUnit } from './types/go-types.mts';

function packageScopes(parser: Parser, sources: readonly GoSource[]): Map<string, Set<string>> {
  const scopes = new Map<string, Set<string>>();
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

function unitsOfSource(
  parser: Parser,
  { file, text }: GoSource,
  scopes: ReadonlyMap<string, ReadonlySet<string>>,
): GoUnit[] {
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

export function goProjectUnits(parser: Parser, sources: readonly GoSource[]): GoUnit[] {
  const scopes = packageScopes(parser, sources);
  return sources.flatMap((source) => unitsOfSource(parser, source, scopes));
}
