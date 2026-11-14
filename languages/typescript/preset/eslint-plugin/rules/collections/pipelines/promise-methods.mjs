import { calledMember, memberName, unwrapped } from '../costly-forms/repeated-runs.mjs';

const PROMISE_METHODS = new Set(['all', 'allSettled', 'any', 'race']);
const SINGLE_FORMS = new Map([
  ['all', '`[await promise]`'],
  ['race', '`await promise`'],
]);

function promiseMethod(call) {
  const member = calledMember(call);
  const owner = member === undefined ? undefined : unwrapped(member.object);
  const method = member === undefined ? undefined : memberName(member);
  return owner?.type === 'Identifier' && owner.name === 'Promise' && PROMISE_METHODS.has(method)
    ? method
    : undefined;
}

export function promiseSteps(call) {
  const method = promiseMethod(call);
  const [list] = call.arguments;
  if (method === undefined || call.arguments.length !== 1 || list.type !== 'ArrayExpression') {
    return [];
  }
  const awaited = list.elements.filter((element) => element?.type === 'AwaitExpression');
  if (awaited.length > 0) {
    return awaited.map((node) => ({ node, messageId: 'awaitInPromiseMethod', data: { method } }));
  }
  const [only] = list.elements;
  const form = SINGLE_FORMS.get(method);
  return list.elements.length === 1 && only !== null && only.type !== 'SpreadElement' && form
    ? [{ node: call, messageId: 'singlePromise', data: { method, form } }]
    : [];
}
