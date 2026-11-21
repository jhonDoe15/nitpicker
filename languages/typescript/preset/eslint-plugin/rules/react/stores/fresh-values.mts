import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nodeChildren, nodesWithoutNested } from '../../typed/node-views.mts';
import { TYPE_WRAPPERS, unwrapOf, type FunctionNode } from '../../typed/syntax-views.mts';

const functionTypes = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const listMethods = new Set(['filter', 'map', 'flatMap', 'toSorted', 'toReversed']);
const objectListings = new Set(['keys', 'values', 'entries', 'fromEntries']);

export function plainExpression(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, TYPE_WRAPPERS);
}

function freshCall(call: TSESTree.CallExpression): string | undefined {
  const callee = plainExpression(call.callee);
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const method = callee.property.name;
  const isObjectListing =
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Object' &&
    objectListings.has(method);
  if (isObjectListing) {
    const shape = method === 'fromEntries' ? 'object' : 'array';
    return `the new ${shape} from \`Object.${method}(...)\``;
  }
  return listMethods.has(method) ? `the new array from \`.${method}(...)\`` : undefined;
}

export function freshValue(node: TSESTree.Node): string | undefined {
  const plain = plainExpression(node);
  if (plain.type === AST_NODE_TYPES.ObjectExpression) {
    return 'a new object';
  }
  if (plain.type === AST_NODE_TYPES.ArrayExpression) {
    return 'a new array';
  }
  return plain.type === AST_NODE_TYPES.CallExpression ? freshCall(plain) : undefined;
}

export function returnedExpressions(fn: FunctionNode): TSESTree.Node[] {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }
  return nodesWithoutNested(fn.body, functionTypes, nodeChildren).flatMap((node) =>
    node.type === AST_NODE_TYPES.ReturnStatement && node.argument !== null ? [node.argument] : [],
  );
}

export function freshReturn(
  fn: FunctionNode,
  describe: (node: TSESTree.Node) => string | undefined = freshValue,
): string | undefined {
  return returnedExpressions(fn)
    .map((expression) => describe(expression))
    .find((described) => described !== undefined);
}
