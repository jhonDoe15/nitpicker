import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';

export function vitestImportAliases(
  known: ReadonlySet<string>,
  node: TSESTree.ImportDeclaration,
): string[] {
  if (node.source.value !== 'vitest') {
    return [];
  }
  return node.specifiers.flatMap((specifier) => {
    const imported =
      specifier.type === AST_NODE_TYPES.ImportSpecifier ? nameOf(specifier.imported) : undefined;
    return imported !== undefined && known.has(imported) ? [specifier.local.name] : [];
  });
}
