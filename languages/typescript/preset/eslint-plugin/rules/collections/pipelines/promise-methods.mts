import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { calledMember, memberName, unwrapped } from '../costly-forms/repeated-runs.mts';

const PROMISE_METHODS = new Set(['all', 'allSettled', 'any', 'race']);
const SINGLE_FORMS = new Map([
  ['all', '`[await promise]`'],
  ['race', '`await promise`'],
]);

type Step = TSESLint.ReportDescriptor<'awaitInPromiseMethod' | 'singlePromise'>;

function promiseMethod(call: TSESTree.CallExpression): string | undefined {
  const member = calledMember(call);
  const owner = member === undefined ? undefined : unwrapped(member.object);
  const method = member === undefined ? undefined : memberName(member);
  return owner?.type === AST_NODE_TYPES.Identifier &&
    owner.name === 'Promise' &&
    method !== undefined &&
    PROMISE_METHODS.has(method)
    ? method
    : undefined;
}

export function promiseSteps(call: TSESTree.CallExpression): Step[] {
  const method = promiseMethod(call);
  const [list] = call.arguments;
  if (
    method === undefined ||
    call.arguments.length !== 1 ||
    list?.type !== AST_NODE_TYPES.ArrayExpression
  ) {
    return [];
  }
  const awaited = list.elements.filter(
    (element): element is TSESTree.AwaitExpression =>
      element?.type === AST_NODE_TYPES.AwaitExpression,
  );
  if (awaited.length > 0) {
    return awaited.map((node) => ({ node, messageId: 'awaitInPromiseMethod', data: { method } }));
  }
  const [only] = list.elements;
  const form = SINGLE_FORMS.get(method);
  return list.elements.length === 1 &&
    only !== null &&
    only !== undefined &&
    only.type !== AST_NODE_TYPES.SpreadElement &&
    form !== undefined
    ? [{ node: call, messageId: 'singlePromise', data: { method, form } }]
    : [];
}
