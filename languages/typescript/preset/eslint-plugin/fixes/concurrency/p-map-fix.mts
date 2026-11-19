import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { appendingArgument } from '../support/calls.mts';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';

export const FAN_OUT_LIMIT = 8;

const OPTION = 'concurrency';
const MIN_ARGUMENTS = 2;
const MAX_ARGUMENTS = 3;

function unlimitedValue(property: TSESTree.ObjectLiteralElement): TSESTree.Node | undefined {
  return property.type === AST_NODE_TYPES.Property &&
    property.value.type === AST_NODE_TYPES.Identifier &&
    property.value.name === 'Infinity'
    ? property.value
    : undefined;
}

function raisingOptions(
  sourceCode: SourceCode,
  options: TSESTree.ObjectExpression,
): FixPlan | undefined {
  const existing = options.properties.find((property) => keyName(property) === OPTION);
  if (existing === undefined) {
    return addingProperty(sourceCode, options, `${OPTION}: ${String(FAN_OUT_LIMIT)}`);
  }
  const value = unlimitedValue(existing);
  return value === undefined || hasCommentIn(sourceCode, existing.range)
    ? undefined
    : replacing(value.range, String(FAN_OUT_LIMIT));
}

export function pMapFix(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): FixPlan | undefined {
  const { arguments: args } = call;
  if (
    args.length < MIN_ARGUMENTS ||
    args.length > MAX_ARGUMENTS ||
    args.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)
  ) {
    return undefined;
  }
  const options = args[MAX_ARGUMENTS - 1];
  if (options === undefined) {
    return appendingArgument(sourceCode, call, `{ ${OPTION}: ${String(FAN_OUT_LIMIT)} }`);
  }
  return isPlainObject(options) ? raisingOptions(sourceCode, options) : undefined;
}
