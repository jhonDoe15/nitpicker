import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { type SourceContext } from '../../analysis/constant-resolution.mts';
import { propertyKeyName } from '../../analysis/test-code-analysis.mts';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { ASSERTION_FORMS, resolvedThrough } from '../../typed/syntax-views.mts';
import { bindingName, staticCommandText, wordsOf } from '../support/process-command-helpers.mts';

type MaybeNode = TSESTree.Node | undefined;

type PropertyQuery = {
  readonly matcher: (key: string) => boolean;
  readonly visited: Set<TSESTree.Node>;
};

const JAVA_COMMAND_PATH = /(?:^|\/bin\/)java(?:\.exe)?$/iu;
const JAVA_ENV_KEYS = new Set(['JDK_JAVA_OPTIONS', 'JAVA_TOOL_OPTIONS']);
const HEAP_CEILING = /(?:^|\s)(?:-Xmx(?:\S|$)|-XX:MaxRAMPercentage=)/u;
const HEAP_GOAL = /(?:^|\s)-XX:(?:GCTimeRatio|SoftMaxHeapSize|MaxHeapFreeRatio)=/u;

export function isJavaCommand(context: SourceContext, commandNode: MaybeNode): boolean {
  const name = bindingName(commandNode);
  if (name !== undefined && wordsOf(name).includes('java')) {
    return true;
  }
  const text = staticCommandText(context, commandNode, true);
  return text !== undefined && JAVA_COMMAND_PATH.test(text.replaceAll('\\', '/'));
}

function collectCallStrings(
  context: SourceContext,
  call: TSESTree.CallExpression,
  visited: Set<TSESTree.Node>,
): string[] {
  if (call.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return [];
  }
  const method = memberName(call.callee);
  if (method === 'join') {
    return collectFlagStrings(context, call.callee.object, visited);
  }
  if (method === 'concat') {
    return [
      ...collectFlagStrings(context, call.callee.object, visited),
      ...call.arguments.flatMap((arg) => collectFlagStrings(context, arg, visited)),
    ];
  }
  return [];
}

function collectArrayStrings(
  context: SourceContext,
  array: TSESTree.ArrayExpression,
  visited: Set<TSESTree.Node>,
): string[] {
  const result: string[] = [];
  for (const element of array.elements) {
    if (element === null) {
      continue;
    }
    const target = element.type === AST_NODE_TYPES.SpreadElement ? element.argument : element;
    result.push(...collectFlagStrings(context, target, visited));
  }
  return result;
}

function collectFlagStrings(
  context: SourceContext,
  node: MaybeNode,
  visited: Set<TSESTree.Node>,
): string[] {
  const value = resolvedThrough(context, node, ASSERTION_FORMS);
  if (value === undefined || visited.has(value)) {
    return [];
  }
  visited.add(value);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return collectArrayStrings(context, value, visited);
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return collectCallStrings(context, value, visited);
  }
  const text = staticCommandText(context, value, true);
  return text === undefined ? [] : [text];
}

function findObjectProperty(
  context: SourceContext,
  objectNode: MaybeNode,
  query: PropertyQuery,
): TSESTree.Node[] {
  const resolved = resolvedThrough(context, objectNode, ASSERTION_FORMS);
  if (resolved?.type !== AST_NODE_TYPES.ObjectExpression || query.visited.has(resolved)) {
    return [];
  }
  query.visited.add(resolved);
  const found: TSESTree.Node[] = [];
  for (const prop of resolved.properties) {
    if (prop.type === AST_NODE_TYPES.SpreadElement) {
      found.push(...findObjectProperty(context, prop.argument, query));
      continue;
    }
    const key = propertyKeyName(prop);
    if (key !== undefined && query.matcher(key)) {
      found.push(prop.value);
    }
  }
  return found;
}

function extractEnvFlags(context: SourceContext, options: MaybeNode): string[] {
  const envNodes = findObjectProperty(context, options, {
    matcher: (key) => key === 'env',
    visited: new Set(),
  });
  const optionValues = envNodes.flatMap((envNode) =>
    findObjectProperty(context, envNode, {
      matcher: (key) => JAVA_ENV_KEYS.has(key),
      visited: new Set(),
    }),
  );
  return optionValues.flatMap((value) => collectFlagStrings(context, value, new Set()));
}

export function hasHeapCeilingWithoutGoal(
  context: SourceContext,
  call: TSESTree.CallExpression,
  options: MaybeNode,
): boolean {
  const argsNode = call.arguments[1];
  const argFlags =
    argsNode === undefined || argsNode === options
      ? []
      : collectFlagStrings(context, argsNode, new Set());
  const envFlags = extractEnvFlags(context, options);
  const allFlags = [...argFlags, ...envFlags];
  return (
    allFlags.some((flag) => HEAP_CEILING.test(flag)) &&
    !allFlags.some((flag) => HEAP_GOAL.test(flag))
  );
}
