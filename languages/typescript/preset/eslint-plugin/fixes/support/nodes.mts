import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isNode, type SourceCode } from '../../rules/typed/node-views.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type Search = {
  readonly matches: (node: TSESTree.Node) => boolean;
  readonly intoFunctions: boolean;
};

export function containsNode(
  sourceCode: SourceCode,
  root: TSESTree.Node,
  { matches, intoFunctions }: Search,
): boolean {
  const pending = [root];
  for (const node of pending) {
    if (matches(node)) {
      return true;
    }
    const isFunction = node.type.includes('Function');
    if (isFunction && !intoFunctions && node !== root) {
      continue;
    }
    for (const key of sourceCode.visitorKeys[node.type] ?? []) {
      appendAll(pending, [Reflect.get(node, key)].flat().filter(isNode));
    }
  }
  return false;
}

export function importedName(specifier: TSESTree.ImportClause): string | undefined {
  if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
    return undefined;
  }
  const { imported } = specifier;
  return imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value;
}
