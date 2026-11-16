import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, type SourceContext } from '../../rules/analysis/constant-resolution.mts';
import { cachedValue } from '../../../../../../shared/values/caching/cached-value.mts';
import { chainOf } from '../../rules/typed/node-views.mts';
import { resolvedFunction } from '../unowned-async/hosts.mts';
import {
  countsAsAssertion,
  nodesIn,
  type FileBindings,
  type FunctionNode,
} from '../unowned-async/nodes.mts';
import { isInline, isIterationArgument } from './loops.mts';
import { isTestBoundary, subtestCallback } from './subtests.mts';

type Facts = {
  readonly nodes: TSESTree.Node[];
  readonly callees: FunctionNode[];
  readonly direct: boolean;
};
type Via = Map<FunctionNode, FunctionNode | undefined>;
export type LoopEnv = {
  readonly context: SourceContext;
  readonly bindings: FileBindings;
  readonly facts: Map<FunctionNode, Facts>;
  readonly helpers: Map<FunctionNode, boolean>;
  readonly analyzed: Set<FunctionNode>;
};

function calledFunction(context: SourceContext, node: TSESTree.Node): FunctionNode | undefined {
  return node.type === AST_NODE_TYPES.CallExpression
    ? resolvedFunction(context, node.callee)
    : undefined;
}

function referencedFunction(context: SourceContext, node: TSESTree.Node): FunctionNode | undefined {
  if (node.type === AST_NODE_TYPES.Identifier && isIterationArgument(node)) {
    return resolvedFunction(context, node);
  }
  return calledFunction(context, node);
}

function isDetached(node: TSESTree.Node): boolean {
  return isFunctionNode(node) && !isInline(node);
}

function collectFacts({ context, bindings }: LoopEnv, fn: FunctionNode): Facts {
  const nodes = nodesIn(
    context,
    fn.body,
    (child) => !(isTestBoundary(context, child) || isDetached(child)),
  );
  const callees = nodes.map((node) => referencedFunction(context, node));
  return {
    nodes,
    callees: [...new Set(callees.filter((callee) => callee !== undefined))],
    direct: nodes.some((node) => countsAsAssertion(node, bindings)),
  };
}

export function factsOf(env: LoopEnv, fn: FunctionNode): Facts {
  return cachedValue(env.facts, fn, () => collectFacts(env, fn));
}

function remember(
  env: LoopEnv,
  { via, from, result }: { via: Via; from: FunctionNode; result: boolean },
): void {
  for (const fn of result ? chainOf(from, (current) => via.get(current)) : via.keys()) {
    env.helpers.set(fn, result);
  }
}

function stepFrom(
  env: LoopEnv,
  fn: FunctionNode,
  via: Via,
): { found: boolean; queued: FunctionNode[] } {
  const facts = factsOf(env, fn);
  const callees = facts.callees.filter((candidate) => !via.has(candidate));
  if (facts.direct || callees.some((callee) => env.helpers.get(callee) === true)) {
    return { found: true, queued: [] };
  }
  return { found: false, queued: callees.filter((callee) => !env.helpers.has(callee)) };
}

function holdsAssertion(env: LoopEnv, start: FunctionNode): boolean {
  const via: Via = new Map([[start, undefined]]);
  const pending = [start];
  for (const fn of pending) {
    const { found, queued } = stepFrom(env, fn, via);
    if (found) {
      remember(env, { via, from: fn, result: true });
      return true;
    }
    for (const callee of queued) {
      via.set(callee, fn);
      pending.push(callee);
    }
  }
  remember(env, { via, from: start, result: false });
  return false;
}

function isAssertingHelper(env: LoopEnv, fn: FunctionNode | undefined): boolean {
  if (fn === undefined) {
    return false;
  }
  if (!env.helpers.has(fn)) {
    holdsAssertion(env, fn);
  }
  return env.helpers.get(fn) === true;
}

export function siteKind(env: LoopEnv, node: TSESTree.Node): 'subtest' | 'assertion' | undefined {
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    subtestCallback(env.context, node) !== undefined
  ) {
    return 'subtest';
  }
  const asserts =
    countsAsAssertion(node, env.bindings) ||
    isAssertingHelper(env, referencedFunction(env.context, node));
  return asserts ? 'assertion' : undefined;
}
