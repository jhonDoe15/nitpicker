import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { appendingArgument } from '../support/calls.mts';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mts';
import type { FixPlan } from '../support/ranges.mts';

type TimeoutSite = {
  readonly method: string;
  readonly timeout: number | string;
  readonly optionsNode: TSESTree.Node | undefined;
};

function addedToOptions(
  sourceCode: SourceCode,
  options: TSESTree.Node,
  timeout: number | string,
): FixPlan | undefined {
  if (!isPlainObject(options)) {
    return undefined;
  }
  const hasTimeout = options.properties.some((entry) => keyName(entry) === 'timeout');
  return hasTimeout
    ? undefined
    : addingProperty(sourceCode, options, `timeout: ${String(timeout)}`);
}

function missingOptions(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  { method, timeout }: Omit<TimeoutSite, 'optionsNode'>,
): FixPlan | undefined {
  const options = `{ timeout: ${String(timeout)} }`;
  const count = call.arguments.length;
  if (method === 'execSync') {
    return count === 1 ? appendingArgument(sourceCode, call, options) : undefined;
  }
  const [, second] = call.arguments;
  if (count === 1) {
    return appendingArgument(sourceCode, call, `[], ${options}`);
  }
  return count === 2 && second?.type === AST_NODE_TYPES.ArrayExpression
    ? appendingArgument(sourceCode, call, options)
    : undefined;
}

export function processTimeoutFix(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  { method, timeout, optionsNode }: TimeoutSite,
): FixPlan | undefined {
  if (
    call.arguments.length === 0 ||
    call.arguments.some(({ type }) => type === AST_NODE_TYPES.SpreadElement)
  ) {
    return undefined;
  }
  return optionsNode === undefined
    ? missingOptions(sourceCode, call, { method, timeout })
    : addedToOptions(sourceCode, optionsNode, timeout);
}
