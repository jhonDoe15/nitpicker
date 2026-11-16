import { ancestorsOf, contains } from '../analysis/ancestry.mjs';
import { callsWithin } from '../effects/held-scopes.mts';
import { isEstreeConsumed } from '../support/flow/consumed.mts';
import { callEffects } from '../support/io-effects.mts';

const ITEM_IO = ['database', 'remote'];

export function itemWork(loop, context) {
  const { visitorKeys } = context.sourceCode;
  return callsWithin(loop.body, visitorKeys)
    .filter((call) => call.type === 'CallExpression' && isEstreeConsumed(call))
    .flatMap((call) => {
      const effects = callEffects(call, context);
      const kind = ITEM_IO.find((each) => effects.has(each));
      return kind === undefined ? [] : [{ call, path: effects.get(kind) }];
    });
}

function rethrows(handler) {
  const body = handler.body?.type === 'BlockStatement' ? handler.body.body : [handler.body];
  return body.some((statement) => statement.type === 'ThrowStatement');
}

function isFunction(node) {
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function catchHandler(call) {
  const outer = call.parent?.type === 'MemberExpression' ? call.parent.parent : undefined;
  const method = call.parent?.property?.name;
  if (outer?.type !== 'CallExpression' || outer.callee !== call.parent) {
    return undefined;
  }
  if (method === 'catch') {
    return outer.arguments[0];
  }
  return method === 'then' ? outer.arguments[1] : undefined;
}

function catchesPerItem(call) {
  const handler = catchHandler(call);
  return handler !== undefined && !(isFunction(handler) && rethrows(handler));
}

function inTryWithCatch(call, loop) {
  return ancestorsOf(call)
    .filter((ancestor) => contains(loop.body, ancestor))
    .some(
      (ancestor) =>
        ancestor.type === 'TryStatement' &&
        ancestor.handler !== null &&
        contains(ancestor.block, call) &&
        !rethrows(ancestor.handler),
    );
}

export function isIsolated(call, loop) {
  return catchesPerItem(call) || inTryWithCatch(call, loop);
}

export function settlesAll(loop, context) {
  return callsWithin(loop.body, context.sourceCode.visitorKeys).some(
    (call) =>
      call.callee.type === 'MemberExpression' &&
      call.callee.object.name === 'Promise' &&
      call.callee.property.name === 'allSettled',
  );
}
