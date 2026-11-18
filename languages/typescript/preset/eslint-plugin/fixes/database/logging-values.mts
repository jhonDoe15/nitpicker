import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../../rules/analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../../rules/security/security-values.mts';
import { isPlainObject, keyName } from '../support/objects.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';

const QUERY = 'query';
const KEPT_TYPEORM = "['error', 'warn']";
const ALL_BUT_QUERY = "['log', 'info', 'warn', 'error', 'schema', 'migration']";
const LOG_METHODS = new Set(['log', 'info']);
const LOGGER_OWNERS = new Set(['console', 'logger', 'log']);

function stringOf(node: TSESTree.Node | null | undefined): string | undefined {
  return node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function isLiteralValue(node: TSESTree.Node, value: unknown): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === value;
}

function logMember(node: TSESTree.Node): boolean {
  const target = unwrapped(node);
  const owner =
    target.type === AST_NODE_TYPES.MemberExpression ? unwrapped(target.object) : undefined;
  return (
    target.type === AST_NODE_TYPES.MemberExpression &&
    owner?.type === AST_NODE_TYPES.Identifier &&
    LOGGER_OWNERS.has(owner.name) &&
    LOG_METHODS.has(memberName(target) ?? '')
  );
}

function isPlainLogFunction(node: TSESTree.Node): boolean {
  if (!isFunctionNode(node) || node.params.length > 1 || node.async || node.generator) {
    return false;
  }
  const [param] = node.params;
  const body = node.body.type === AST_NODE_TYPES.BlockStatement ? node.body.body : [node.body];
  const [only] = body;
  const call = only?.type === AST_NODE_TYPES.ExpressionStatement ? only.expression : only;
  return (
    body.length === 1 &&
    param?.type === AST_NODE_TYPES.Identifier &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    logMember(call.callee) &&
    call.arguments.length === 1 &&
    call.arguments[0]?.type === AST_NODE_TYPES.Identifier &&
    call.arguments[0].name === param.name
  );
}

function listedStrings(array: TSESTree.ArrayExpression): string[] | undefined {
  const names = array.elements.map(stringOf);
  return names.every((name) => name !== undefined) ? names : undefined;
}

function levelsText(
  context: Context,
  array: TSESTree.ArrayExpression,
  levels: ReadonlySet<string>,
) {
  const kept = array.elements.filter((element) => !levels.has(stringOf(element) ?? ''));
  return kept.map((element) => context.sourceCode.getText(element ?? array)).join(', ');
}

function typeormArray(context: Context, array: TSESTree.ArrayExpression): string | undefined {
  const names = listedStrings(array);
  if (names === undefined) {
    return undefined;
  }
  if (names.includes('all')) {
    return ALL_BUT_QUERY;
  }
  const rest = levelsText(context, array, new Set([QUERY]));
  return rest === '' ? 'false' : `[${rest}]`;
}

function replacingValue(context: Context, value: TSESTree.Node, text: string | undefined) {
  return text === undefined || hasCommentIn(context.sourceCode, value.range)
    ? undefined
    : replacing(value.range, text);
}

export function typeormLogging(context: Context, value: TSESTree.Node): FixPlan | undefined {
  if (isLiteralValue(value, true)) {
    return replacingValue(context, value, KEPT_TYPEORM);
  }
  if (isLiteralValue(value, 'all')) {
    return replacingValue(context, value, ALL_BUT_QUERY);
  }
  return value.type === AST_NODE_TYPES.ArrayExpression
    ? replacingValue(context, value, typeormArray(context, value))
    : undefined;
}

export function sequelizeLogging(context: Context, value: TSESTree.Node): FixPlan | undefined {
  const quiet = isLiteralValue(value, true) || logMember(value) || isPlainLogFunction(value);
  return quiet ? replacingValue(context, value, 'false') : undefined;
}

export function switchedOff(context: Context, value: TSESTree.Node): FixPlan | undefined {
  return isLiteralValue(value, true) ? replacingValue(context, value, 'false') : undefined;
}

export function mikroDebug(context: Context, value: TSESTree.Node): FixPlan | undefined {
  if (isLiteralValue(value, true)) {
    return replacingValue(context, value, 'false');
  }
  const names = value.type === AST_NODE_TYPES.ArrayExpression ? listedStrings(value) : undefined;
  if (value.type !== AST_NODE_TYPES.ArrayExpression || names === undefined) {
    return undefined;
  }
  const rest = levelsText(context, value, new Set([QUERY, 'query-params']));
  return replacingValue(context, value, rest === '' ? 'false' : `[${rest}]`);
}

function logsQuery(entry: TSESTree.Node | null): boolean | undefined {
  if (stringOf(entry) !== undefined) {
    return stringOf(entry) === QUERY;
  }
  if (entry === null || !isPlainObject(entry)) {
    return undefined;
  }
  const field = (name: string) => {
    const property = entry.properties.find((each) => keyName(each) === name);
    return property?.type === AST_NODE_TYPES.Property ? property.value : undefined;
  };
  const emit = stringOf(field('emit'));
  const hasEmit = field('emit') !== undefined;
  return stringOf(field('level')) === QUERY && (emit === 'stdout' || !hasEmit);
}

export function prismaLog(context: Context, value: TSESTree.Node): FixPlan | undefined {
  if (value.type !== AST_NODE_TYPES.ArrayExpression) {
    return undefined;
  }
  const verdicts = value.elements.map(logsQuery);
  if (verdicts.some((verdict) => verdict === undefined)) {
    return undefined;
  }
  const kept = value.elements.filter((_, index) => verdicts[index] === false);
  const text = kept.map((element) => context.sourceCode.getText(element ?? value)).join(', ');
  return replacingValue(context, value, `[${text}]`);
}
