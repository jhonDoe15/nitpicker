import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { childrenOf } from '../loops/loop-shapes.mts';
import type { Context } from '../security/security-values.mts';
import { isOwned } from '../support/flow/scope-owners.mts';
import { estreeRunsWithCaller } from '../support/flow/sync-callbacks.mts';
import { estreeCallView, type CallView } from '../support/io/call-views.mts';
import { memoized } from '../../../../../../shared/values/caches/memo.mts';
import { ancestorsOf, chainOf, contains, nameOf, type SourceCode } from '../typed/node-views.mts';

import { BEGIN_TEXT, END_TEXT, SCOPES, SQL_METHODS, TRANSACTION } from './scopes/scope-words.mts';
import type {
  Branch,
  BodyIndex,
  Call,
  Construct,
  FunctionNode,
  HeldScope,
  Marker,
  OpenerFunction,
  Part,
  Role,
  ScopeKind,
  VisitorKeys,
} from './scopes/scope-types.mts';

const BEGINS = 'begins';
const ENDS = 'ends';
const EXITS = new Set<string>([AST_NODE_TYPES.ReturnStatement, AST_NODE_TYPES.ThrowStatement]);
const bodyIndexes = new WeakMap<TSESTree.Node, Map<ScopeKind, BodyIndex>>();
const callbackScopes = new WeakMap<FunctionNode, HeldScope>();

function isBranch(node: TSESTree.Node): node is Branch {
  return (
    node.type === AST_NODE_TYPES.IfStatement ||
    node.type === AST_NODE_TYPES.CatchClause ||
    node.type === AST_NODE_TYPES.SwitchCase ||
    node.type === AST_NODE_TYPES.ConditionalExpression
  );
}

function hasCallback(call: TSESTree.CallExpression): boolean {
  return call.arguments.some(isFunctionNode);
}

function runsWithCaller(node: TSESTree.Node): boolean {
  return !isFunctionNode(node) || estreeRunsWithCaller(node);
}

export function callsWithin(root: TSESTree.Node, visitorKeys: VisitorKeys): Call[] {
  const calls: Call[] = [];
  const pending = [root];
  for (const node of pending) {
    if (
      node.type === AST_NODE_TYPES.CallExpression ||
      node.type === AST_NODE_TYPES.TaggedTemplateExpression
    ) {
      calls.push(node);
    }
    pending.push(...childrenOf(node, visitorKeys).filter(runsWithCaller));
  }
  return calls.toSorted((left, right) => left.range[0] - right.range[0]);
}

function calleeMethod(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return callee.computed ? undefined : nameOf(callee.property);
  }
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
}

function isCallbackOpener(
  kind: ScopeKind,
  fn: FunctionNode,
  context: Context,
): fn is OpenerFunction {
  const call = fn.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const argumentNodes: readonly TSESTree.Node[] = call.arguments;
  if (!(argumentNodes.includes(fn) && SCOPES[kind].callbacks.has(calleeMethod(call) ?? ''))) {
    return false;
  }
  return isOwned(kind, { call, view: estreeCallView(call, undefined), role: 'callbacks' }, context);
}

function statementText(kind: ScopeKind, view: CallView): string {
  const [first] = view.args;
  const isSql =
    kind === TRANSACTION && SQL_METHODS.has(view.method ?? '') && first?.type === 'text';
  return isSql ? first.text : '';
}

function isMarkerCandidate(kind: ScopeKind, call: TSESTree.CallExpression): boolean {
  const method = calleeMethod(call) ?? '';
  const scope = SCOPES[kind];
  return (
    scope.ends.has(method) ||
    scope.begins.has(method) ||
    (kind === TRANSACTION && SQL_METHODS.has(method))
  );
}

function markerRole(kind: ScopeKind, call: Call, context: Context): Role | undefined {
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    hasCallback(call) ||
    !isMarkerCandidate(kind, call)
  ) {
    return undefined;
  }
  const view = estreeCallView(call, undefined);
  const text = statementText(kind, view);
  if (SCOPES[kind].ends.has(view.method ?? '') || END_TEXT.test(text)) {
    return ENDS;
  }
  const begins = SCOPES[kind].begins.has(view.method ?? '') || BEGIN_TEXT.test(text);
  return begins && isOwned(kind, { call, view, role: BEGINS }, context) ? BEGINS : undefined;
}

function inTest(ancestor: Branch, node: TSESTree.Node): boolean {
  return 'test' in ancestor && ancestor.test !== null && contains(ancestor.test, node);
}

function branchOf(node: TSESTree.Node, body: TSESTree.Node): Branch | undefined {
  const inside = ancestorsOf(node).filter((ancestor) => contains(body, ancestor));
  return inside.find(
    (ancestor): ancestor is Branch => isBranch(ancestor) && !inTest(ancestor, node),
  );
}

function bodyIndex(kind: ScopeKind, body: TSESTree.Node, context: Context): BodyIndex {
  const perBody = memoized(bodyIndexes, body, () => new Map<ScopeKind, BodyIndex>());
  return memoized(perBody, kind, () => {
    const calls = callsWithin(body, context.sourceCode.visitorKeys);
    const markers = calls.flatMap((call) => {
      const role = markerRole(kind, call, context);
      return role === undefined ? [] : [{ call, role, branch: branchOf(call, body) }];
    });
    return { body, calls, markers, scopes: new Map<Call, HeldScope>() };
  });
}

function closes(marker: Marker, node: TSESTree.Node): boolean {
  return marker.branch === undefined || contains(marker.branch, node);
}

function alternatives(construct: Exclude<Construct, TSESTree.CatchClause>): Part[] {
  if (construct.type === AST_NODE_TYPES.SwitchStatement) {
    const hasDefault = construct.cases.some((each) => each.test === null);
    return hasDefault ? construct.cases.filter((each) => each.consequent.length > 0) : [undefined];
  }
  if (construct.type !== AST_NODE_TYPES.IfStatement) {
    return [construct.consequent, construct.alternate];
  }
  const chain = chainOf<TSESTree.IfStatement>(construct, (each) =>
    each.alternate?.type === AST_NODE_TYPES.IfStatement ? each.alternate : undefined,
  );
  return [...chain.map((each) => each.consequent), chain.at(-1)?.alternate ?? undefined];
}

function exits(part: TSESTree.Node): boolean {
  if (part.type === AST_NODE_TYPES.BlockStatement) {
    return EXITS.has(part.body.at(-1)?.type ?? '');
  }
  const statements = part.type === AST_NODE_TYPES.SwitchCase ? part.consequent : [part];
  return EXITS.has(statements.at(-1)?.type ?? '');
}

function endsAlternative(index: BodyIndex, part: Part): boolean {
  if (part === undefined) {
    return false;
  }
  return (
    exits(part) ||
    index.markers.some((marker) => marker.role === ENDS && contains(part, marker.call))
  );
}

function constructOf(branch: Branch): Construct | undefined {
  if (branch.type === AST_NODE_TYPES.SwitchCase) {
    return branch.parent;
  }
  return chainOf<TSESTree.IfStatement | TSESTree.CatchClause | TSESTree.ConditionalExpression>(
    branch,
    (each) =>
      each.parent.type === AST_NODE_TYPES.IfStatement && each.parent.alternate === each
        ? each.parent
        : undefined,
  ).at(-1);
}

function endsAfter(index: BodyIndex, marker: Marker, node: TSESTree.Node): boolean {
  const construct = marker.branch === undefined ? undefined : constructOf(marker.branch);
  return (
    construct !== undefined &&
    construct.type !== AST_NODE_TYPES.CatchClause &&
    construct.range[1] <= node.range[0] &&
    alternatives(construct).every((part) => endsAlternative(index, part))
  );
}

function openScope(index: BodyIndex, begin: Call): HeldScope {
  const end = index.markers.find(
    (marker) =>
      marker.role === ENDS && marker.call.range[0] >= begin.range[1] && closes(marker, begin),
  )?.call;
  const calls = index.calls.filter(
    (call) =>
      call.range[0] >= begin.range[1] && (end === undefined || call.range[1] <= end.range[0]),
  );
  const root = index.body;
  return {
    opener: begin,
    calls,
    param: estreeCallView(begin, undefined).root,
    closing: end,
    root,
  };
}

function rangeScope(index: BodyIndex, node: TSESTree.Node): HeldScope | undefined {
  const last = index.markers
    .filter((marker) => marker.call.range[1] <= node.range[0])
    .filter(
      (marker) => marker.role === BEGINS || closes(marker, node) || endsAfter(index, marker, node),
    )
    .at(-1);
  return last?.role === BEGINS
    ? memoized(index.scopes, last.call, () => openScope(index, last.call))
    : undefined;
}

function callbackScope(
  kind: ScopeKind,
  node: TSESTree.Node,
  context: Context,
): HeldScope | undefined {
  for (const fn of ancestorsOf(node).filter(isFunctionNode)) {
    if (isCallbackOpener(kind, fn, context)) {
      return memoized(callbackScopes, fn, () => ({
        opener: fn.parent,
        calls: callsWithin(fn.body, context.sourceCode.visitorKeys),
        param: fn.params[0],
        root: fn.body,
        closing: fn.parent.parent.type === AST_NODE_TYPES.AwaitExpression ? fn.parent : undefined,
      }));
    }
    if (!estreeRunsWithCaller(fn)) {
      return undefined;
    }
  }
  return undefined;
}

function unitBody(node: TSESTree.Node, sourceCode: SourceCode): TSESTree.Node {
  const fn = ancestorsOf(node)
    .filter(isFunctionNode)
    .find((each) => !estreeRunsWithCaller(each));
  return fn === undefined ? sourceCode.ast : fn.body;
}

export function heldScope(
  kind: ScopeKind,
  node: TSESTree.Node,
  context: Context,
): HeldScope | undefined {
  const callback = callbackScope(kind, node, context);
  if (callback !== undefined) {
    return callback;
  }
  return rangeScope(bodyIndex(kind, unitBody(node, context.sourceCode), context), node);
}

export function isOnParameter(call: Call, param: TSESTree.Node | undefined): boolean {
  const { root } = estreeCallView(call, undefined);
  return param?.type === AST_NODE_TYPES.Identifier && root?.name === param.name;
}

export function scopeLabel(scope: HeldScope): string {
  return estreeCallView(scope.opener, undefined).label;
}
