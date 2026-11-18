import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  awaitPromiseFix,
  dropAwaitFix,
  mayRunTogether,
} from '../../../fixes/collections/promise-fixes.mts';
import { suggestible } from '../../../fixes/support/descriptors.mts';
import type { Context } from '../../security/security-values.mts';
import { calledMember, memberName, unwrapped } from '../costly-forms/repeated-runs.mts';

const PROMISE_METHODS = new Set(['all', 'allSettled', 'any', 'race']);
const SINGLE_ADVICE = new Map([
  ['all', 'Await the promise itself where the array result is not used.'],
  ['race', 'Use the promise itself: `await promise`.'],
]);

type Step = TSESLint.ReportDescriptor<
  'awaitInPromiseMethod' | 'singlePromise' | 'dropAwait' | 'awaitPromise'
>;

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

function awaitedSteps(
  context: Context,
  call: TSESTree.CallExpression,
  { method, awaited }: { method: string; awaited: TSESTree.AwaitExpression[] },
): Step[] {
  const together = method === 'all' && mayRunTogether(context, call);
  return awaited.map((node) =>
    suggestible(
      { node, messageId: 'awaitInPromiseMethod', data: { method } },
      { messageId: 'dropAwait', plan: together ? dropAwaitFix(context, node) : undefined },
    ),
  );
}

export function promiseSteps(context: Context, call: TSESTree.CallExpression): Step[] {
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
    return awaitedSteps(context, call, { method, awaited });
  }
  const [only] = list.elements;
  const advice = SINGLE_ADVICE.get(method);
  return list.elements.length === 1 &&
    only !== null &&
    only !== undefined &&
    only.type !== AST_NODE_TYPES.SpreadElement &&
    advice !== undefined
    ? [
        suggestible(
          { node: call, messageId: 'singlePromise', data: { method, advice } },
          { messageId: 'awaitPromise', plan: awaitPromiseFix(context, call, only) },
        ),
      ]
    : [];
}
