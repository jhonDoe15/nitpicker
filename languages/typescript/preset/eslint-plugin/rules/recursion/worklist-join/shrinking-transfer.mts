import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import {
  isNamedMember,
  literalValue,
  unwrapped,
  type FunctionNode,
} from '../../typed/syntax-views.mts';
import type { MonotoneJoinMatch } from './monotone-join.mts';
import type { WorklistInfo } from './worklist-loop.mts';
import { bodyNodesOf, containerGetOf, stripFallback, targetNameOf } from './worklist-nodes.mts';

type ShrinkContext = {
  readonly state: string;
  readonly nodeVar: string | undefined;
  readonly auxSets: ReadonlySet<string>;
  readonly successorVars: ReadonlySet<string>;
  readonly nextAliases: ReadonlyMap<string, string>;
  readonly stateDerived: ReadonlySet<string>;
};

const REMOVE_METHODS = new Set(['delete', 'clear', 'difference', 'splice']);
const ALL_CAPS_CONST = /^[A-Z][A-Z0-9_]+$/u;
const RESET_NAME =
  /^(?:default|reset|empty|initial|bottom|top|unknown|none|fallback|zero|nil|null)/iu;
const EMPTY_COLLECTIONS = new Set(['Set', 'Map']);
const NULLISH_OPS = new Set(['===', '!==', '==', '!=']);

function isEmptyContainer(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements.length === 0;
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.length === 0;
  }
  return (
    node.type === AST_NODE_TYPES.NewExpression &&
    node.arguments.length === 0 &&
    EMPTY_COLLECTIONS.has(nameOf(unwrapped(node.callee)) ?? '')
  );
}

function isResetName(name: string): boolean {
  return ALL_CAPS_CONST.test(name) || RESET_NAME.test(name);
}

function isResetIdentifierOrMember(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === 'undefined' || isResetName(node.name);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed) {
    const prop = nameOf(node.property);
    return prop !== undefined && isResetName(prop);
  }
  return false;
}

function isConstantOrResetValue(node: TSESTree.Node): boolean {
  const inner = unwrapped(node);
  if (inner.type === AST_NODE_TYPES.Literal || isEmptyContainer(inner)) {
    return true;
  }
  if (inner.type === AST_NODE_TYPES.UnaryExpression) {
    return unwrapped(inner.argument).type === AST_NODE_TYPES.Literal;
  }
  return isResetIdentifierOrMember(inner);
}

function isResetValue(node: TSESTree.Node): boolean {
  const inner = unwrapped(node);
  if (isEmptyContainer(inner) || isResetIdentifierOrMember(inner)) {
    return true;
  }
  const lit = literalValue(inner);
  return lit === 0 || lit === false || lit === null || lit === '';
}

function isNextStateExpr(node: TSESTree.Node, ctx: ShrinkContext): boolean {
  const inner = stripFallback(node);
  if (inner.type === AST_NODE_TYPES.Identifier && ctx.nextAliases.has(inner.name)) {
    return true;
  }
  const access = containerGetOf(inner);
  return (
    access !== undefined && access.container === ctx.state && ctx.successorVars.has(access.key)
  );
}

function isStateNodeRead(node: TSESTree.Node, ctx: ShrinkContext): boolean {
  const inner = stripFallback(node);
  if (inner.type === AST_NODE_TYPES.Identifier && ctx.stateDerived.has(inner.name)) {
    return true;
  }
  if (ctx.nodeVar === undefined) {
    return false;
  }
  const access = containerGetOf(inner);
  return access !== undefined && access.container === ctx.state && access.key === ctx.nodeVar;
}

function referencesStateDerived(root: TSESTree.Node, ctx: ShrinkContext): boolean {
  return bodyNodesOf(root).some((node) => isStateNodeRead(node, ctx));
}

function isNullishLiteral(node: TSESTree.Node): boolean {
  const inner = unwrapped(node);
  return (
    (inner.type === AST_NODE_TYPES.Literal && inner.value === null) ||
    (inner.type === AST_NODE_TYPES.Identifier && inner.name === 'undefined')
  );
}

function isNullishGuard(test: TSESTree.Expression): boolean {
  const inner = unwrapped(test);
  if (inner.type === AST_NODE_TYPES.UnaryExpression && inner.operator === '!') {
    return unwrapped(inner.argument).type === AST_NODE_TYPES.Identifier;
  }
  return (
    inner.type === AST_NODE_TYPES.BinaryExpression &&
    NULLISH_OPS.has(inner.operator) &&
    (isNullishLiteral(inner.left) || isNullishLiteral(inner.right))
  );
}

function isShrinkingMemberCall(
  node: TSESTree.CallExpression,
  callee: TSESTree.MemberExpression,
  ctx: ShrinkContext,
): boolean {
  const method = nameOf(callee.property);
  const target = targetNameOf(callee.object);
  if (
    method === undefined ||
    (target !== undefined && ctx.auxSets.has(target)) ||
    isNextStateExpr(callee.object, ctx)
  ) {
    return false;
  }
  if (REMOVE_METHODS.has(method)) {
    return true;
  }
  if (method === 'filter') {
    return isStateNodeRead(callee.object, ctx);
  }
  const second = node.arguments[1];
  return (
    method === 'set' &&
    second !== undefined &&
    target !== ctx.state &&
    isConstantOrResetValue(second)
  );
}

function isShrinkingCall(node: TSESTree.CallExpression, ctx: ShrinkContext): boolean {
  const callee = unwrapped(node.callee);
  if (isNamedMember(callee, 'Math', 'min')) {
    return !node.arguments.some((arg) => isNextStateExpr(arg, ctx));
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    isShrinkingMemberCall(node, callee, ctx)
  );
}

function isShrinkingAssignment(node: TSESTree.AssignmentExpression, ctx: ShrinkContext): boolean {
  if (node.operator === '&=') {
    return true;
  }
  if (node.operator === '-=') {
    return isStateNodeRead(node.left, ctx);
  }
  if (node.operator !== '=') {
    return false;
  }
  if (node.left.type === AST_NODE_TYPES.Identifier) {
    return ctx.stateDerived.has(node.left.name) && isResetValue(node.right);
  }
  if (node.left.type !== AST_NODE_TYPES.MemberExpression || !node.left.computed) {
    return false;
  }
  const target = targetNameOf(node.left.object);
  return (
    target !== ctx.state &&
    (target === undefined || !ctx.auxSets.has(target)) &&
    !isNextStateExpr(node.left.object, ctx) &&
    isConstantOrResetValue(node.right)
  );
}

function isShrinkingBinary(node: TSESTree.BinaryExpression, ctx: ShrinkContext): boolean {
  if (node.operator === '&') {
    const leftNot = unwrapped(node.left);
    const rightNot = unwrapped(node.right);
    return (
      (leftNot.type === AST_NODE_TYPES.UnaryExpression && leftNot.operator === '~') ||
      (rightNot.type === AST_NODE_TYPES.UnaryExpression && rightNot.operator === '~')
    );
  }
  return node.operator === '-' && isStateNodeRead(node.left, ctx);
}

function isShrinkingConditional(node: TSESTree.ConditionalExpression, ctx: ShrinkContext): boolean {
  if (isNullishGuard(node.test)) {
    return false;
  }
  const leftReset = isResetValue(node.consequent);
  const rightReset = isResetValue(node.alternate);
  return (
    (leftReset && referencesStateDerived(node.alternate, ctx)) ||
    (rightReset && referencesStateDerived(node.consequent, ctx))
  );
}

function isShrinkingNode(node: TSESTree.Node, ctx: ShrinkContext): boolean {
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator === 'delete';
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return isShrinkingCall(node, ctx);
  }
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return isShrinkingAssignment(node, ctx);
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    return isShrinkingBinary(node, ctx);
  }
  return node.type === AST_NODE_TYPES.ConditionalExpression && isShrinkingConditional(node, ctx);
}

function collectStateDerived(nodes: readonly TSESTree.Node[], ctx: ShrinkContext): Set<string> {
  const derived = new Set<string>(ctx.stateDerived);
  const nextCtx: ShrinkContext = { ...ctx, stateDerived: derived };
  for (const node of nodes) {
    if (
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.id.type === AST_NODE_TYPES.Identifier &&
      node.init !== null &&
      referencesStateDerived(node.init, nextCtx)
    ) {
      derived.add(node.id.name);
    }
  }
  return derived;
}

function helperParamNames(fn: FunctionNode): Set<string> {
  const names = new Set<string>();
  for (const param of fn.params) {
    if (param.type === AST_NODE_TYPES.Identifier) {
      names.add(param.name);
    }
  }
  return names;
}

function bodyHasShrinking(nodes: readonly TSESTree.Node[], baseCtx: ShrinkContext): boolean {
  const stateDerived = collectStateDerived(nodes, baseCtx);
  const ctx: ShrinkContext = { ...baseCtx, stateDerived };
  return nodes.some((node) => isShrinkingNode(node, ctx));
}

export function hasShrinkingTransfer(
  info: WorklistInfo,
  joinMatch: MonotoneJoinMatch,
  helpers: readonly FunctionNode[],
): boolean {
  const loopCtx: ShrinkContext = {
    state: joinMatch.state,
    nodeVar: info.nodeVar,
    auxSets: info.auxSets,
    successorVars: info.successorVars,
    nextAliases: joinMatch.nextAliases,
    stateDerived: new Set(),
  };
  if (bodyHasShrinking(info.nodes, loopCtx)) {
    return true;
  }
  for (const fn of helpers) {
    const helperCtx: ShrinkContext = {
      state: joinMatch.state,
      nodeVar: undefined,
      auxSets: new Set(),
      successorVars: new Set(),
      nextAliases: new Map(),
      stateDerived: helperParamNames(fn),
    };
    if (bodyHasShrinking(bodyNodesOf(fn.body), helperCtx)) {
      return true;
    }
  }
  return false;
}
