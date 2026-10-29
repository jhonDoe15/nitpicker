import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import { heldScope } from '../effects/held-scopes.mjs';
import { awaited } from '../effects/lazy-relations.mjs';
import { contains, enclosingLoop } from '../loops/loop-shapes.mjs';
import { callEffects } from '../support/io-effects.mjs';

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

function loopElement(found, sourceCode) {
  if (found?.loop?.type === 'ForOfStatement') {
    const { left, right } = found.loop;
    const variables =
      left.type === 'VariableDeclaration' ? sourceCode.getDeclaredVariables(left) : [];
    return { variables, iterable: right, scope: found.loop };
  }
  const callee = found?.callback?.parent.callee;
  if (callee?.type !== 'MemberExpression') {
    return undefined;
  }
  const [param] = found.callback.params;
  const variables = sourceCode
    .getDeclaredVariables(found.callback)
    .filter((variable) => variable.defs.some((def) => contains(param, def.name)));
  return { variables, iterable: callee.object, scope: found.callback };
}

function sourceCall(context, iterable) {
  const value = awaited(iterable);
  if (value?.type !== 'Identifier') {
    return value;
  }
  return awaited(findVariable(context, value, value.name)?.defs[0]?.node.init);
}

function isDatabaseRead(context, iterable) {
  const call = sourceCall(context, iterable);
  if (call?.type !== 'CallExpression') {
    return false;
  }
  const effects = callEffects(call, context);
  return effects.has('database') && !effects.has('write');
}

function references(variables, call) {
  return variables.some((variable) =>
    variable.references.some((reference) => contains(call, reference.identifier)),
  );
}

export function isRelayPublish(publish, writes, context) {
  const element = loopElement(enclosingLoop(publish.call, context.sourceCode), context.sourceCode);
  if (element === undefined || !references(element.variables, publish.call)) {
    return false;
  }
  return (
    isDatabaseRead(context, element.iterable) &&
    writes.some(
      ({ call }) =>
        call.range[0] >= publish.call.range[1] &&
        contains(element.scope, call) &&
        references(element.variables, call),
    )
  );
}

function isCommittedBefore(write, publish, context) {
  const scope = heldScope('transaction', write.call, context);
  const closing = scope?.closing;
  return closing !== undefined && closing.range[1] <= publish.call.range[0];
}

function isInAfterCommitHook(call, unit) {
  return ancestorsOf(call)
    .filter(
      (ancestor) => FUNCTIONS.has(ancestor.type) && contains(unit, ancestor) && ancestor !== unit,
    )
    .some(
      (fn) =>
        fn.parent.type === 'CallExpression' &&
        fn.parent.arguments.includes(fn) &&
        fn.parent.callee.property?.name === 'afterCommit',
    );
}

export function publishesAfterCommit(publish, writes, { context, unit }) {
  return (
    isInAfterCommitHook(publish.call, unit) ||
    writes.every((write) => isCommittedBefore(write, publish, context))
  );
}
