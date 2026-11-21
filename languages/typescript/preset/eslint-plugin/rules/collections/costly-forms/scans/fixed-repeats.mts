import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { TSESLint } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  contains,
  variableNamed,
  type Ranged,
  type SourceCode,
} from '../../../typed/node-views.mts';
import { isFunction } from '../../../typed/syntax-views.mts';
import { callbackRole, outerOf, someNode, unwrapped } from '../repeated-runs.mts';

const { DefinitionType } = TSESLint.Scope;

const LOOPS = new Set<string>([
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);
const BOUNDS = new Set(['<', '<=']);

function isLiteralList(node: TSESTree.Node | null | undefined): boolean {
  const value = node === null || node === undefined ? undefined : unwrapped(node);
  return (
    value?.type === AST_NODE_TYPES.ArrayExpression &&
    value.elements.every(
      (element) => element !== null && element.type !== AST_NODE_TYPES.SpreadElement,
    )
  );
}

function hasLiteralBound(loop: TSESTree.ForStatement): boolean {
  const { test } = loop;
  return (
    test?.type === AST_NODE_TYPES.BinaryExpression &&
    BOUNDS.has(test.operator) &&
    test.right.type === AST_NODE_TYPES.Literal &&
    typeof test.right.value === 'number'
  );
}

function iteratesFixedList(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ForOfStatement) {
    return isLiteralList(node.right);
  }
  if (node.type === AST_NODE_TYPES.ForStatement) {
    return hasLiteralBound(node);
  }
  if (!isFunction(node)) {
    return false;
  }
  const call = outerOf(node).parent;
  const callee = call?.type === AST_NODE_TYPES.CallExpression ? unwrapped(call.callee) : undefined;
  return callee?.type === AST_NODE_TYPES.MemberExpression && isLiteralList(callee.object);
}

function repeats(node: TSESTree.Node): boolean {
  return LOOPS.has(node.type) || (isFunction(node) && callbackRole(node) === 'callback');
}

export function onlyFixedRepeats(node: TSESTree.Node, boundary: Ranged): boolean {
  const repeating = ancestorsOf(node).filter(
    (ancestor) => !contains(ancestor, boundary) && repeats(ancestor),
  );
  return repeating.length > 0 && repeating.every(iteratesFixedList);
}

function perPass(sourceCode: SourceCode, identifier: TSESTree.Identifier, owner: TSESTree.Node) {
  const definition = variableNamed(sourceCode, identifier)?.defs[0];
  if (definition === undefined || !contains(owner, definition.name)) {
    return false;
  }
  return (
    definition.type !== DefinitionType.Parameter ||
    !('params' in definition.node) ||
    definition.node.params.indexOf(definition.name as TSESTree.Parameter) < 2
  );
}

export function readsElement(
  sourceCode: SourceCode,
  value: TSESTree.Node,
  node: TSESTree.Node,
): boolean {
  const owner = ancestorsOf(node).find(repeats);
  return (
    owner !== undefined &&
    someNode(
      value,
      (child) => child.type === AST_NODE_TYPES.Identifier && perPass(sourceCode, child, owner),
    )
  );
}
