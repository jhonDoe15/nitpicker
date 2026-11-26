import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { ModuleBindings } from '../analysis/subprocess-calls.mts';
import { resolveFunction, type SourceContext } from '../analysis/constant-resolution.mts';
import { calleeMethod } from '../processes/process-callees.mts';
import { depthFirst, nodeChildren } from '../typed/node-views.mts';
import { unwrapOf } from '../typed/syntax-views.mts';

const STARTS = new Set([
  'spawn',
  'spawnSync',
  'execFile',
  'execFileSync',
  'exec',
  'execSync',
  'fork',
  'execa',
  'execaSync',
  'execaNode',
  'execaCommand',
  'execaCommandSync',
]);
const WRAPPERS = [AST_NODE_TYPES.AwaitExpression, AST_NODE_TYPES.TSAsExpression];

function startsChildDirectly(node: TSESTree.Node, bindings: ModuleBindings): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression && node.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  return STARTS.has(calleeMethod(node.callee, bindings) ?? '');
}

export function stepCall(
  init: TSESTree.Node | null | undefined,
): TSESTree.CallExpression | undefined {
  const value = init === null || init === undefined ? undefined : unwrapOf(init, WRAPPERS);
  return value?.type === AST_NODE_TYPES.CallExpression ? value : undefined;
}

export type ChildBodies = Map<TSESTree.Node, boolean>;

function bodyStartsChild(
  body: TSESTree.Node,
  bindings: ModuleBindings,
  known: ChildBodies,
): boolean {
  const cached = known.get(body);
  if (cached !== undefined) {
    return cached;
  }
  const starts = [...depthFirst<TSESTree.Node>(body, nodeChildren)].some((node) =>
    startsChildDirectly(node, bindings),
  );
  known.set(body, starts);
  return starts;
}

export function startsChild(
  context: SourceContext,
  call: TSESTree.CallExpression,
  bindings: ModuleBindings,
  known: ChildBodies,
): boolean {
  if (startsChildDirectly(call, bindings)) {
    return true;
  }
  const body = resolveFunction(context, call.callee)?.body;
  return body !== undefined && body !== null && bodyStartsChild(body, bindings, known);
}
