import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, depthFirst, isNode } from '../typed/node-views.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const SKIPPED = new Set(['parent', 'loc', 'range', 'tokens', 'comments']);

function syntaxIn(value: unknown): TSESTree.Node[] {
  if (Array.isArray(value)) {
    return value.filter(isNode);
  }
  return isNode(value) ? [value] : [];
}

/** The syntax nodes directly below `node`, without positions or the parent link. */
export function syntaxChildren(node: TSESTree.Node): TSESTree.Node[] {
  return Object.keys(node)
    .filter((name) => !SKIPPED.has(name))
    .flatMap((name) => syntaxIn(Reflect.get(node, name)));
}

/** Whether `node` starts a function of its own. */
export function isFunction(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

/** `root` and the syntax below it, without entering functions nested in it. */
export function inside(root: TSESTree.Node): Iterable<TSESTree.Node> {
  return depthFirst(root, (node) =>
    isFunction(node) && node !== root ? [] : syntaxChildren(node),
  );
}

/** The syntax of an expression outside the functions in it: none when it is a function itself. */
export function outsideFunctions(root: TSESTree.Node): Iterable<TSESTree.Node> {
  return depthFirst(root, (node) => (isFunction(node) ? [] : syntaxChildren(node)));
}

const REFERENCES = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.ThisExpression,
]);
const EQUALITIES = new Set(['===', '!==', '==', '!=']);

function withoutNegation(node: TSESTree.Node): TSESTree.Node {
  return (
    chainOf<TSESTree.Node>(node, (current) =>
      current.type === AST_NODE_TYPES.UnaryExpression && current.operator === '!'
        ? current.argument
        : undefined,
    ).at(-1) ?? node
  );
}

function isNullish(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && node.value === null && node.raw === 'null') ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined')
  );
}

/**
 * Whether TypeScript narrows on `node` itself: a truthiness test of one reference, or one compared
 * with `null` or `undefined`. `@typescript-eslint/no-unnecessary-condition` reports those already.
 */
export function isNarrowingTest(node: TSESTree.Node): boolean {
  const test = withoutNegation(node);
  if (REFERENCES.has(test.type)) {
    return true;
  }
  if (test.type !== AST_NODE_TYPES.BinaryExpression || !EQUALITIES.has(test.operator)) {
    return false;
  }
  const sides = [test.left, test.right];
  return sides.some(isNullish) && sides.some((side) => REFERENCES.has(side.type));
}
