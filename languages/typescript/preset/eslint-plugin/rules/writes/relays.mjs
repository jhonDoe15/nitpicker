import { findVariable } from '../analysis/constant-resolution.mjs';
import { callsWithin } from '../effects/held-scopes.mjs';
import { awaited } from '../effects/lazy-relations.mjs';
import { childrenOf, contains, enclosingLoop } from '../loops/loop-shapes.mjs';
import { callEffects } from '../support/io-effects.mjs';

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

function argumentIdentifiers(call, visitorKeys) {
  const pending = [...call.arguments];
  for (const node of pending) {
    pending.push(...childrenOf(node, visitorKeys));
  }
  return pending.filter((node) => node.type === 'Identifier');
}

function readRows(call, context) {
  const variables = argumentIdentifiers(call, context.sourceCode.visitorKeys).map((identifier) =>
    findVariable(context, identifier, identifier.name),
  );
  return [...new Set(variables)].filter((variable) => {
    const definition = variable?.defs[0];
    return definition?.type === 'Variable' && isDatabaseRead(context, definition.node.init);
  });
}

function isMarkedAfter(element, publish, writes) {
  return writes.some(
    ({ call }) =>
      call.range[0] >= publish.range[1] &&
      contains(element.scope, call) &&
      references(element.variables, call),
  );
}

export function isRelayPublish(publish, writes, context) {
  const element = loopElement(enclosingLoop(publish.call, context.sourceCode), context.sourceCode);
  const looped =
    element !== undefined &&
    references(element.variables, publish.call) &&
    isDatabaseRead(context, element.iterable);
  if (looped) {
    return isMarkedAfter(element, publish.call, writes);
  }
  const rows = readRows(publish.call, context);
  const single = { variables: rows, scope: context.sourceCode.ast };
  return rows.length > 0 && isMarkedAfter(single, publish.call, writes);
}

export function isRelayMark(call, context) {
  const element = loopElement(enclosingLoop(call, context.sourceCode), context.sourceCode);
  if (element === undefined || !references(element.variables, call)) {
    return false;
  }
  const body = element.scope.body;
  const publishes = callsWithin(body, context.sourceCode.visitorKeys).filter(
    (each) =>
      each.range[1] <= call.range[0] &&
      references(element.variables, each) &&
      callEffects(each, context).has('message'),
  );
  return (
    publishes.length > 0 &&
    callEffects(call, context).has('write') &&
    isDatabaseRead(context, element.iterable)
  );
}
