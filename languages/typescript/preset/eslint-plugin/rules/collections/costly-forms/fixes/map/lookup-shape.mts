import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  calledMember,
  equalitySides,
  memberName,
  referencesName,
  returnedExpression,
  unwrapped,
} from '../../repeated-runs.mts';
import { isSimpleValue } from '../simple-values.mts';

type LookupMethod = 'find' | 'findIndex' | 'findLast' | 'findLastIndex' | 'some';

export type LookupShape = {
  readonly method: LookupMethod;
  readonly receiver: TSESTree.Identifier;
  readonly parameter: string;
  readonly key: string;
  readonly keyNode: TSESTree.Node;
  readonly value: TSESTree.Node;
};

const METHODS = new Set<string>(['find', 'findIndex', 'findLast', 'findLastIndex', 'some']);

function isLookupMethod(name: string | undefined): name is LookupMethod {
  return name !== undefined && METHODS.has(name);
}

function keyOf(side: TSESTree.Node, parameter: string): string | undefined {
  const member = unwrapped(side);
  return member.type === AST_NODE_TYPES.MemberExpression &&
    !member.optional &&
    member.object.type === AST_NODE_TYPES.Identifier &&
    member.object.name === parameter &&
    member.property.type === AST_NODE_TYPES.Identifier &&
    !member.computed
    ? memberName(member)
    : undefined;
}

function callbackParameter(callback: TSESTree.Node | undefined): string | undefined {
  if (callback?.type !== AST_NODE_TYPES.ArrowFunctionExpression || callback.async) {
    return undefined;
  }
  const [parameter] = callback.params;
  return callback.params.length === 1 && parameter?.type === AST_NODE_TYPES.Identifier
    ? parameter.name
    : undefined;
}

export function lookupShape(call: TSESTree.CallExpression): LookupShape | undefined {
  const member = calledMember(call);
  const method = member === undefined ? undefined : memberName(member);
  const [callback] = call.arguments;
  const parameter = callbackParameter(callback);
  const sides = equalitySides(returnedExpression(callback));
  const receiver = member?.object;
  if (
    !isLookupMethod(method) ||
    member?.optional === true ||
    call.optional ||
    call.arguments.length !== 1 ||
    parameter === undefined ||
    sides === undefined ||
    receiver?.type !== AST_NODE_TYPES.Identifier ||
    receiver.name === parameter
  ) {
    return undefined;
  }
  const [left, right] = sides;
  const keyed: readonly (readonly [string | undefined, TSESTree.Node, TSESTree.Node])[] = [
    [keyOf(left, parameter), left, right],
    [keyOf(right, parameter), right, left],
  ];
  const found = keyed.find(
    ([key, , value]) =>
      key !== undefined && isSimpleValue(value) && !referencesName(value, parameter),
  );
  return found?.[0] === undefined
    ? undefined
    : { method, receiver, parameter, key: found[0], keyNode: found[1], value: found[2] };
}
