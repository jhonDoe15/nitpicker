import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  equalitySides,
  methodCallOn,
  numberValue,
  outerOf,
  referencesName,
  returnedExpression,
  singleParameter,
  unwrapped,
} from '../../repeated-runs.mts';

export type Membership = {
  readonly replaced: TSESTree.Node;
  readonly element: TSESTree.Node;
  readonly present: boolean;
  readonly strict: boolean;
};

const ABSENT_COMPARISONS = new Set(['=== -1', '== -1', '< 0', '<= -1']);
const PRESENT_COMPARISONS = new Set(['!== -1', '!= -1', '>= 0', '> -1']);

function identifierName(node: TSESTree.Node | undefined): string | undefined {
  return node?.type === AST_NODE_TYPES.Identifier ? node.name : undefined;
}

function identityElement(callback: TSESTree.Node | undefined): TSESTree.Node | undefined {
  const name = singleParameter(callback);
  const body = returnedExpression(callback);
  const comparison = body === undefined ? undefined : unwrapped(body);
  if (
    name === undefined ||
    comparison?.type !== AST_NODE_TYPES.BinaryExpression ||
    comparison.operator !== '==='
  ) {
    return undefined;
  }
  const sides = equalitySides(comparison);
  const [left, right] = (sides ?? []).map(unwrapped);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (identifierName(left) === name && !referencesName(right, name)) {
    return right;
  }
  return identifierName(right) === name && !referencesName(left, name) ? left : undefined;
}

function comparisonKey(call: TSESTree.CallExpression): string | undefined {
  const comparison = outerOf(call).parent;
  if (comparison?.type !== AST_NODE_TYPES.BinaryExpression || comparison.left !== call) {
    return undefined;
  }
  const key = `${comparison.operator} ${String(numberValue(comparison.right))}`;
  return ABSENT_COMPARISONS.has(key) || PRESENT_COMPARISONS.has(key) ? key : undefined;
}

function plainCall(call: TSESTree.CallExpression): boolean {
  const [argument] = call.arguments;
  return (
    !call.optional &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    !call.callee.optional &&
    call.arguments.length === 1 &&
    argument?.type !== AST_NODE_TYPES.SpreadElement
  );
}

export function membershipOf(
  reference: TSESTree.Identifier,
): (Membership & { readonly call: TSESTree.CallExpression }) | undefined {
  const method = methodCallOn(reference);
  const call = method?.call;
  const [argument] = call?.arguments ?? [];
  if (
    call === undefined ||
    argument === undefined ||
    !plainCall(call) ||
    outerOf(reference) !== reference
  ) {
    return undefined;
  }
  if (method?.name === 'includes') {
    return { call, replaced: call, element: argument, present: true, strict: false };
  }
  if (method?.name === 'some') {
    const element = identityElement(argument);
    return element === undefined
      ? undefined
      : { call, replaced: call, element, present: true, strict: true };
  }
  const key = method?.name === 'indexOf' ? comparisonKey(call) : undefined;
  const comparison = outerOf(call).parent;
  if (key === undefined || comparison === undefined || outerOf(call) !== call) {
    return undefined;
  }
  return {
    call,
    replaced: comparison,
    element: argument,
    present: PRESENT_COMPARISONS.has(key),
    strict: true,
  };
}
