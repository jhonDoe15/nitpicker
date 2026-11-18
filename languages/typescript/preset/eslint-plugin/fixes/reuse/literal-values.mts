import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { foldTree } from '../../rules/typed/node-views.mts';

export type Literal = { readonly value: unknown };

type Found = Literal | undefined;

function children(node: TSESTree.Node): readonly TSESTree.Node[] {
  switch (node.type) {
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return [node.expression];
    case AST_NODE_TYPES.ArrayExpression:
      return node.elements.filter((item) => item !== null);
    case AST_NODE_TYPES.ObjectExpression:
      return node.properties.flatMap((entry) =>
        entry.type === AST_NODE_TYPES.Property ? [entry.value] : [],
      );
    default:
      return [];
  }
}

function numberOf(node: TSESTree.UnaryExpression): Found {
  const { argument } = node;
  if (
    (node.operator !== '-' && node.operator !== '+') ||
    argument.type !== AST_NODE_TYPES.Literal ||
    typeof argument.value !== 'number'
  ) {
    return undefined;
  }
  return { value: node.operator === '-' ? -argument.value : argument.value };
}

function propertyKey(entry: TSESTree.Property): string | undefined {
  if (entry.computed || entry.kind !== 'init' || entry.method) {
    return undefined;
  }
  if (entry.key.type === AST_NODE_TYPES.Identifier) {
    return entry.key.name;
  }
  return entry.key.type === AST_NODE_TYPES.Literal && typeof entry.key.value === 'string'
    ? entry.key.value
    : undefined;
}

function arrayOf(node: TSESTree.ArrayExpression, results: readonly Found[]): Found {
  const complete = node.elements.every((item) => item !== null);
  return complete && results.every((found) => found !== undefined)
    ? { value: results.map((found) => found?.value) }
    : undefined;
}

function objectOf(node: TSESTree.ObjectExpression, results: readonly Found[]): Found {
  const keys = node.properties.map((entry) =>
    entry.type === AST_NODE_TYPES.Property ? propertyKey(entry) : undefined,
  );
  if (keys.some((key) => key === undefined || key === '__proto__')) {
    return undefined;
  }
  if (results.some((found) => found === undefined)) {
    return undefined;
  }
  return { value: Object.fromEntries(keys.map((key, index) => [key, results[index]?.value])) };
}

function combine(node: TSESTree.Node, results: readonly Found[]): Found {
  switch (node.type) {
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return results[0];
    case AST_NODE_TYPES.Literal:
      return 'regex' in node || typeof node.value === 'bigint' ? undefined : { value: node.value };
    case AST_NODE_TYPES.TemplateLiteral: {
      const cooked = node.quasis[0]?.value.cooked;
      return node.expressions.length === 0 && typeof cooked === 'string'
        ? { value: cooked }
        : undefined;
    }
    case AST_NODE_TYPES.UnaryExpression:
      return numberOf(node);
    case AST_NODE_TYPES.ArrayExpression:
      return arrayOf(node, results);
    case AST_NODE_TYPES.ObjectExpression:
      return objectOf(node, results);
    default:
      return undefined;
  }
}

export function literalValue(root: TSESTree.Node): Found {
  return foldTree<TSESTree.Node, null, Found>(root, null, {
    expand: (node) => children(node).map((child) => [child, null] as const),
    combine: (node, _context, results) => combine(node, results),
  });
}
