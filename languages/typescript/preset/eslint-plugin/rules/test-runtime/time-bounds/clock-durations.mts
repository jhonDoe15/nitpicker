import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed } from '../../typed/node-views.mts';
import { isWallRead } from '../../wall-clock/no-wall-clock-elapsed.mts';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
type Clock = 'date' | 'performance';

function readClock(node: TSESTree.Node): Clock | undefined {
  if (isWallRead(node)) {
    return 'date';
  }
  const isPerformanceNow =
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.object) === 'performance' &&
    nameOf(node.callee.property) === 'now';
  return isPerformanceNow ? 'performance' : undefined;
}

function writtenValues(variable: TSESLint.Scope.Variable): (TSESTree.Node | null | undefined)[] {
  const initial = variable.defs
    .map((definition) =>
      definition.node.type === AST_NODE_TYPES.VariableDeclarator ? definition.node.init : undefined,
    )
    .filter((value) => value !== null);
  const assigned = variable.references
    .filter((reference) => reference.isWrite() && reference.init !== true)
    .map((reference) => reference.writeExpr);
  return [...initial, ...assigned];
}

function heldValues(context: Context, node: TSESTree.Node): (TSESTree.Node | null | undefined)[] {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return [node];
  }
  const variable = variableNamed(context.sourceCode, node);
  return variable === undefined || variable.defs.length !== 1
    ? [undefined]
    : writtenValues(variable);
}

function clockOf(context: Context, node: TSESTree.Node): Clock | undefined {
  const clocks = new Set(
    heldValues(context, node).map((value) => (value ? readClock(value) : undefined)),
  );
  const [only] = clocks;
  return clocks.size === 1 ? only : undefined;
}

function declaredAt(context: Context, node: TSESTree.Node): number | undefined {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  return variableNamed(context.sourceCode, node)?.defs[0]?.node.range[0];
}

function isLaterRead(context: Context, later: TSESTree.Node, earlier: TSESTree.Node): boolean {
  const laterAt = declaredAt(context, later);
  if (laterAt === undefined) {
    return true;
  }
  const earlierAt = declaredAt(context, earlier);
  return earlierAt !== undefined && laterAt > earlierAt;
}

function isClockDifference(context: Context, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.BinaryExpression || node.operator !== '-') {
    return false;
  }
  const clock = clockOf(context, node.left);
  return (
    clock !== undefined &&
    clock === clockOf(context, node.right) &&
    isLaterRead(context, node.left, node.right)
  );
}

export function isMeasuredDuration(context: Context, node: TSESTree.Node): boolean {
  const values = heldValues(context, node);
  return (
    values.length > 0 &&
    values.every(
      (value) => value !== null && value !== undefined && isClockDifference(context, value),
    )
  );
}

const CLOCK_OWNERS = new Set(['Date', 'performance']);
const SPIES = new Set(['spyOn', 'stub', 'replace']);
const FAKE_CLOCK_LIBRARIES = new Set(['FakeTimers', 'fakeTimers', 'lolex']);

function stringArgument(node: TSESTree.Node | undefined): unknown {
  return node?.type === AST_NODE_TYPES.Literal ? node.value : undefined;
}

function replacesByCall(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  const method = nameOf(callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : callee);
  const [first, second] = call.arguments;
  if (SPIES.has(method ?? '')) {
    return CLOCK_OWNERS.has(nameOf(first) ?? '') && stringArgument(second) === 'now';
  }
  if (method === 'stubGlobal') {
    return CLOCK_OWNERS.has(String(stringArgument(first)));
  }
  return (
    method === 'install' &&
    callee.type === AST_NODE_TYPES.MemberExpression &&
    FAKE_CLOCK_LIBRARIES.has(nameOf(callee.object) ?? '')
  );
}

export function replacesClock(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return replacesByCall(node);
  }
  return (
    node.type === AST_NODE_TYPES.AssignmentExpression &&
    node.left.type === AST_NODE_TYPES.MemberExpression &&
    CLOCK_OWNERS.has(nameOf(node.left.object) ?? '') &&
    nameOf(node.left.property) === 'now'
  );
}
