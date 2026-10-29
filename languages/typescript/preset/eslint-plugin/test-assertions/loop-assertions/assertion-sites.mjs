import { isFunctionNode } from '../../rules/analysis/constant-resolution.mjs';
import { chainOf } from '../../rules/analysis/ancestry.mjs';
import { resolvedFunction } from '../unowned-async/hosts.mjs';
import { countsAsAssertion, nodesIn } from '../unowned-async/nodes.mjs';
import { isInline, isIterationArgument } from './loops.mjs';
import { isTestBoundary, subtestCallback } from './subtests.mjs';

function calledFunction(context, node) {
  return node.type === 'CallExpression' ? resolvedFunction(context, node.callee) : undefined;
}

export function referencedFunction(context, node) {
  if (node.type === 'Identifier' && isIterationArgument(node)) {
    return resolvedFunction(context, node);
  }
  return calledFunction(context, node);
}

function isDetached(node) {
  return isFunctionNode(node) && !isInline(node);
}

export function factsOf(env, fn) {
  if (!env.facts.has(fn)) {
    const { context, bindings } = env;
    const nodes = nodesIn(
      context,
      fn.body,
      (child) => !isTestBoundary(context, child) && !isDetached(child),
    );
    const callees = nodes.map((node) => referencedFunction(context, node));
    env.facts.set(fn, {
      nodes,
      callees: [...new Set(callees.filter((callee) => callee !== undefined))],
      direct: nodes.some((node) => countsAsAssertion(node, bindings)),
    });
  }
  return env.facts.get(fn);
}

function remember(env, via, from, result) {
  for (const fn of result ? chainOf(from, (current) => via.get(current)) : via.keys()) {
    env.helpers.set(fn, result);
  }
}

function holdsAssertion(env, start) {
  const via = new Map([[start, undefined]]);
  const pending = [start];
  for (const fn of pending) {
    if (factsOf(env, fn).direct) {
      remember(env, via, fn, true);
      return true;
    }
    for (const callee of factsOf(env, fn).callees.filter((candidate) => !via.has(candidate))) {
      if (env.helpers.get(callee) === true) {
        remember(env, via, fn, true);
        return true;
      }
      if (!env.helpers.has(callee)) {
        via.set(callee, fn);
        pending.push(callee);
      }
    }
  }
  remember(env, via, start, false);
  return false;
}

function isAssertingHelper(env, fn) {
  if (fn === undefined) {
    return false;
  }
  if (!env.helpers.has(fn)) {
    holdsAssertion(env, fn);
  }
  return env.helpers.get(fn);
}

export function siteKind(env, node) {
  if (node.type === 'CallExpression' && subtestCallback(env.context, node) !== undefined) {
    return 'subtest';
  }
  const asserts =
    countsAsAssertion(node, env.bindings) ||
    isAssertingHelper(env, referencedFunction(env.context, node));
  return asserts ? 'assertion' : undefined;
}
