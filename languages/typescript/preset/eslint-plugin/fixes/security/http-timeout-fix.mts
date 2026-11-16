import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { appendingArgument } from '../support/calls.mts';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mts';
import type { FixPlan } from '../support/ranges.mts';

type HttpCall = { readonly client: string; readonly call: string };
type HttpFixSite = {
  readonly found: HttpCall;
  readonly axiosPosition: (method: string) => number | undefined;
};

export const HTTP_TIMEOUT_MS = 10_000;

const DEADLINE_KEYS = new Set(['signal', 'timeout', 'dispatcher', 'agent']);

function withDeadline(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  { index, property }: { readonly index: number; readonly property: string },
): FixPlan | undefined {
  const options = call.arguments[index];
  if (options === undefined) {
    return call.arguments.length === index
      ? appendingArgument(sourceCode, call, `{ ${property} }`)
      : undefined;
  }
  if (!isPlainObject(options)) {
    return undefined;
  }
  const hasDeadline = options.properties.some((entry) => {
    const key = keyName(entry);
    return key !== undefined && DEADLINE_KEYS.has(key);
  });
  return hasDeadline ? undefined : addingProperty(sourceCode, options, property);
}

export function httpTimeoutFix(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  { found, axiosPosition }: HttpFixSite,
): FixPlan | undefined {
  if (call.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)) {
    return undefined;
  }
  if (found.client === 'fetch') {
    const property = `signal: AbortSignal.timeout(${String(HTTP_TIMEOUT_MS)})`;
    return call.callee.type === AST_NODE_TYPES.Identifier ||
      call.callee.type === AST_NODE_TYPES.MemberExpression
      ? withDeadline(sourceCode, call, { index: 1, property })
      : undefined;
  }
  const { callee } = call;
  const isMethodCall =
    found.client === 'axios' &&
    found.call.startsWith('axios.') &&
    found.call !== 'axios.create()' &&
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed;
  const index = isMethodCall ? axiosPosition(callee.property.name) : undefined;
  return index === undefined
    ? undefined
    : withDeadline(sourceCode, call, { index, property: `timeout: ${String(HTTP_TIMEOUT_MS)}` });
}
