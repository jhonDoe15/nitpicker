import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import { plainText } from '../../typed/node-views.mts';
import { calleeNameOf, TYPE_WRAPPERS, unwrapOf } from '../../typed/syntax-views.mts';

type OriginState = {
  readonly usageOffset: number;
  readonly visited: Set<TSESLint.Scope.Variable>;
};

const { DefinitionType } = TSESLint.Scope;

const CHAIN_PRESERVING_METHODS = new Set<string>([
  'concat',
  'entries',
  'flatMap',
  'map',
  'reverse',
  'slice',
  'sort',
  'toReversed',
  'toSorted',
  'values',
  'with',
]);

function constFallbackInit(variable: TSESLint.Scope.Variable): TSESTree.Expression | undefined {
  if (variable.defs.length !== 1) {
    return undefined;
  }
  const [definition] = variable.defs;
  if (definition?.type !== DefinitionType.Variable || definition.parent.kind !== 'const') {
    return undefined;
  }
  return definition.node.id.type === AST_NODE_TYPES.Identifier
    ? (definition.node.init ?? undefined)
    : undefined;
}

function latestWriteBefore(
  variable: TSESLint.Scope.Variable,
  usageOffset: number,
): TSESTree.Node | undefined {
  const writes = variable.references.filter(
    (ref) => ref.isWrite() && ref.writeExpr !== null && ref.identifier.range[0] < usageOffset,
  );
  const latest = writes.reduce<TSESLint.Scope.Reference | undefined>(
    (best, current) =>
      best === undefined || current.identifier.range[0] > best.identifier.range[0] ? current : best,
    undefined,
  );
  return latest?.writeExpr ?? constFallbackInit(variable);
}

function isFilteredCall(
  context: SourceContext,
  call: TSESTree.CallExpression,
  state: OriginState,
): boolean {
  const callee = unwrapOf(call.callee, TYPE_WRAPPERS);
  const method = calleeNameOf(callee);
  if (method === 'filter') {
    return call.arguments.length >= 1;
  }
  if (
    method !== undefined &&
    CHAIN_PRESERVING_METHODS.has(method) &&
    callee.type === AST_NODE_TYPES.MemberExpression
  ) {
    return checkFiltered(context, callee.object, state);
  }
  return false;
}

function checkFiltered(context: SourceContext, node: TSESTree.Node, state: OriginState): boolean {
  const expr = unwrapOf(node, TYPE_WRAPPERS);
  if (expr.type === AST_NODE_TYPES.CallExpression) {
    return isFilteredCall(context, expr, state);
  }
  if (expr.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = findVariable(context, expr, expr.name);
  if (variable === undefined || state.visited.has(variable)) {
    return false;
  }
  state.visited.add(variable);
  const init = latestWriteBefore(variable, state.usageOffset);
  return (
    init !== undefined &&
    checkFiltered(context, init, { usageOffset: init.range[0], visited: state.visited })
  );
}

export function isFilteredExpression(
  context: SourceContext,
  node: TSESTree.Node,
  usageOffset: number,
): boolean {
  return checkFiltered(context, node, { usageOffset, visited: new Set() });
}

export function isSameArray(
  context: SourceContext,
  left: TSESTree.Node,
  right: TSESTree.Node,
): boolean {
  const a = unwrapOf(left, TYPE_WRAPPERS);
  const b = unwrapOf(right, TYPE_WRAPPERS);
  if (a.type === AST_NODE_TYPES.Identifier && b.type === AST_NODE_TYPES.Identifier) {
    const varA = findVariable(context, a, a.name);
    const varB = findVariable(context, b, b.name);
    return varA !== undefined || varB !== undefined ? varA === varB : a.name === b.name;
  }
  return plainText(a, context.sourceCode) === plainText(b, context.sourceCode);
}
