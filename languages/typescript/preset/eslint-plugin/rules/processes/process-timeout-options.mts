import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  constantNumber,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { propertyKeyName } from '../analysis/test-code-analysis.mts';
import { variableNamed } from '../typed/node-views.mts';
import { isTypeWrapper, optionsMayChange } from './process-options-mutations.mts';

type MaybeNode = TSESTree.Node | undefined;
type OptionValue = MaybeNode | typeof UNKNOWN_VALUE;
type Entry = { readonly node: MaybeNode; readonly ancestors: readonly TSESTree.Node[] };
type Expanded = { readonly unknown: boolean; readonly properties: readonly Entry[] };

const UNKNOWN_VALUE = Symbol('unknown option value');

function resolved(context: SourceContext, node: MaybeNode): MaybeNode {
  const pending = [resolveConstant(context, node)];
  for (const current of pending) {
    if (isTypeWrapper(current)) {
      pending.push(resolveConstant(context, current.expression));
    }
  }
  return pending.at(-1);
}

function isUndefined(context: SourceContext, node: MaybeNode): boolean {
  return (
    node?.type === AST_NODE_TYPES.Identifier &&
    node.name === 'undefined' &&
    (variableNamed(context.sourceCode, node)?.defs.length ?? 0) === 0
  );
}

function propertyValue(
  property: TSESTree.Property,
  previous: OptionValue,
  key: string,
): OptionValue {
  const name = propertyKeyName(property);
  if (name === key) {
    return property.value;
  }
  return property.computed && name === undefined ? UNKNOWN_VALUE : previous;
}

function expandOptions(context: SourceContext, entry: Entry, call: TSESTree.Node): Expanded {
  const expression =
    entry.node?.type === AST_NODE_TYPES.SpreadElement ? entry.node.argument : entry.node;
  const value = resolved(context, expression);
  if (optionsMayChange(context, expression, call)) {
    return { unknown: true, properties: [] };
  }
  if (value?.type === AST_NODE_TYPES.ObjectExpression && !entry.ancestors.includes(value)) {
    return {
      unknown: false,
      properties: value.properties.map((property) => ({
        node: property,
        ancestors: [...entry.ancestors, value],
      })),
    };
  }
  return {
    unknown:
      value !== undefined &&
      !isUndefined(context, value) &&
      !(value.type === AST_NODE_TYPES.Literal && value.value === null),
    properties: [],
  };
}

function optionReader(
  context: SourceContext,
  call: TSESTree.Node,
  node: MaybeNode,
): (key: string) => OptionValue {
  return (key) => {
    const pending: Entry[] = [{ node, ancestors: [] }];
    let value: OptionValue;
    for (const [index, entry] of pending.entries()) {
      if (entry.node?.type === AST_NODE_TYPES.Property) {
        value = propertyValue(entry.node, value, key);
        continue;
      }
      const expanded = expandOptions(context, entry, call);
      if (expanded.unknown) {
        value = UNKNOWN_VALUE;
      }
      pending.splice(index + 1, 0, ...expanded.properties);
    }
    return value;
  };
}

function isNothing(context: SourceContext, node: MaybeNode): boolean {
  return (
    isUndefined(context, node) || (node?.type === AST_NODE_TYPES.Literal && node.value === null)
  );
}

function optionsCandidate(
  context: SourceContext,
  call: TSESTree.CallExpression,
  commandOnly: boolean,
): MaybeNode {
  const [, second, third] = call.arguments;
  if (commandOnly || third !== undefined) {
    return commandOnly ? second : third;
  }
  return isArgumentList(context, second) ? undefined : second;
}

export function optionsArgument(
  context: SourceContext,
  call: TSESTree.CallExpression,
  commandOnly: boolean,
): MaybeNode {
  const options = optionsCandidate(context, call, commandOnly);
  const isCallback =
    isFunctionNode(resolved(context, options)) || resolveFunction(context, options) !== undefined;
  return isCallback ? undefined : options;
}

function isArgumentList(context: SourceContext, node: MaybeNode): boolean {
  const value = resolved(context, node);
  return value?.type === AST_NODE_TYPES.ArrayExpression || isNothing(context, value);
}

function timeoutMissing(context: SourceContext, timeout: MaybeNode): boolean {
  if (timeout === undefined) {
    return true;
  }
  const value = resolved(context, timeout);
  if (isUndefined(context, value)) {
    return true;
  }
  const number = constantNumber(context, value);
  return number !== undefined && (!Number.isFinite(number) || number <= 0);
}

function signalMissing(context: SourceContext, signal: OptionValue): boolean {
  return (
    signal === undefined ||
    (signal !== UNKNOWN_VALUE && isNothing(context, resolved(context, signal)))
  );
}

export function lacksDeadline(
  context: SourceContext,
  call: TSESTree.CallExpression,
  { options, signalKeys = [] }: { options: MaybeNode; signalKeys?: readonly string[] },
): boolean {
  if (call.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)) {
    return false;
  }
  const optionValue = optionReader(context, call, options);
  const timeout = optionValue('timeout');
  if (timeout === UNKNOWN_VALUE || !timeoutMissing(context, timeout)) {
    return false;
  }
  return signalKeys.every((key) => signalMissing(context, optionValue(key)));
}

export function lacksProcessTimeout(
  context: SourceContext,
  call: TSESTree.CallExpression,
  name: string,
): boolean {
  return lacksDeadline(context, call, {
    options: optionsArgument(context, call, name === 'execSync'),
  });
}
