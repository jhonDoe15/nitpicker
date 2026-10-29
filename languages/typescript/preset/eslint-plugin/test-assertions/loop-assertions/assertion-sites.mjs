import { resolvedFunction } from '../unowned-async/hosts.mjs';
import { countsAsAssertion, nodesIn } from '../unowned-async/nodes.mjs';
import { isIterationArgument } from './loops.mjs';

function calledFunction(context, node) {
  return node.type === 'CallExpression' ? resolvedFunction(context, node.callee) : undefined;
}

export function referencedFunction(context, node) {
  if (node.type === 'Identifier' && isIterationArgument(node)) {
    return resolvedFunction(context, node);
  }
  return calledFunction(context, node);
}

function holdsAssertion(env, start) {
  const seen = new Set([start]);
  const pending = [start];
  for (const fn of pending) {
    const nodes = nodesIn(env.context, fn.body);
    if (nodes.some((node) => countsAsAssertion(node, env.bindings))) {
      return true;
    }
    const callees = nodes
      .map((node) => calledFunction(env.context, node))
      .filter((callee) => callee !== undefined && !seen.has(callee));
    for (const callee of callees) {
      seen.add(callee);
      pending.push(callee);
    }
  }
  return false;
}

function isAssertingHelper(env, fn) {
  if (fn === undefined) {
    return false;
  }
  if (!env.helpers.has(fn)) {
    env.helpers.set(fn, holdsAssertion(env, fn));
  }
  return env.helpers.get(fn);
}

export function isAssertionSite(env, node) {
  if (countsAsAssertion(node, env.bindings)) {
    return true;
  }
  return isAssertingHelper(env, referencedFunction(env.context, node));
}
