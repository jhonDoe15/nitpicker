import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../security/security-values.mts';
import { fallbackSpreadFix } from '../../../fixes/collections/fallback-spread-fix.mts';
import { fixable } from '../../../fixes/support/descriptors.mts';
import { calledMember, memberName, unwrapped } from '../costly-forms/repeated-runs.mts';

const ARRAY_RESULTS = new Set([
  'concat',
  'flat',
  'slice',
  'split',
  'toReversed',
  'toSorted',
  'toSpliced',
  'with',
]);
const STATIC_ARRAY_RESULTS = new Map([
  ['Array', new Set(['from', 'of'])],
  ['Object', new Set(['entries', 'keys', 'values'])],
]);
const ITERABLE_CONSTRUCTORS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);
const PROMISE_METHODS = new Set(['all', 'allSettled', 'any', 'race']);
const FALLBACKS = new Set(['||', '??']);

function staticCall(
  node: TSESTree.Node,
  owners: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const call = unwrapped(node);
  const member = call.type === AST_NODE_TYPES.CallExpression ? calledMember(call) : undefined;
  const owner = member === undefined ? undefined : unwrapped(member.object);
  const name = member === undefined ? undefined : memberName(member);
  return (
    owner?.type === AST_NODE_TYPES.Identifier &&
    name !== undefined &&
    owners.get(owner.name)?.has(name) === true
  );
}

function isNewArray(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return true;
  }
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return staticCall(value.argument, new Map([['Promise', PROMISE_METHODS]]));
  }
  const member = value.type === AST_NODE_TYPES.CallExpression ? calledMember(value) : undefined;
  const name = member === undefined ? undefined : memberName(member);
  return (
    staticCall(value, STATIC_ARRAY_RESULTS) ||
    (member !== undefined && !member.computed && name !== undefined && ARRAY_RESULTS.has(name))
  );
}

function takesIterable(outer: TSESTree.Node): boolean {
  const { parent } = outer;
  if (parent?.type === AST_NODE_TYPES.NewExpression) {
    const callee = unwrapped(parent.callee);
    return (
      parent.arguments[0] === outer &&
      callee.type === AST_NODE_TYPES.Identifier &&
      ITERABLE_CONSTRUCTORS.has(callee.name)
    );
  }
  if (parent?.type === AST_NODE_TYPES.CallExpression) {
    return (
      parent.arguments.length === 1 &&
      parent.arguments[0] === outer &&
      staticCall(
        parent,
        new Map([
          ['Array', new Set(['from'])],
          ['Promise', PROMISE_METHODS],
        ]),
      )
    );
  }
  return false;
}

export function uselessSpread(
  array: TSESTree.ArrayExpression,
): TSESLint.ReportDescriptor<'uselessSpread'> | undefined {
  const [only] = array.elements;
  if (array.elements.length !== 1 || only?.type !== AST_NODE_TYPES.SpreadElement) {
    return undefined;
  }
  if (isNewArray(only.argument)) {
    return {
      node: only,
      messageId: 'uselessSpread',
      data: { what: 'an array that is already new' },
    };
  }
  return takesIterable(array)
    ? {
        node: only,
        messageId: 'uselessSpread',
        data: { what: 'an iterable that the receiver already takes' },
      }
    : undefined;
}

export function fallbackSpread(
  context: Context,
  spread: TSESTree.SpreadElement,
): TSESLint.ReportDescriptor<'fallbackInSpread'> | undefined {
  const value = unwrapped(spread.argument);
  if (value.type !== AST_NODE_TYPES.LogicalExpression) {
    return undefined;
  }
  const fallback = unwrapped(value.right);
  return FALLBACKS.has(value.operator) &&
    fallback.type === AST_NODE_TYPES.ObjectExpression &&
    fallback.properties.length === 0
    ? fixable(
        { node: spread, messageId: 'fallbackInSpread', data: { operator: value.operator } },
        fallbackSpreadFix(context, spread, value),
      )
    : undefined;
}
