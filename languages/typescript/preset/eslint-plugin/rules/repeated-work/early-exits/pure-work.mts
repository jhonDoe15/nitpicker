import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { nodeChildren, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isFsCall } from '../repeated-calls/call-shapes.mts';
import { isFunction, unwrapped } from '../../typed/syntax-views.mts';

const FS_READS = new Set([
  'readFile',
  'readFileSync',
  'readdir',
  'readdirSync',
  'readJson',
  'readJsonSync',
]);
const PURE_STEPS = new Set([
  'concat',
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'flat',
  'flatMap',
  'includes',
  'indexOf',
  'join',
  'map',
  'reduce',
  'slice',
  'some',
  'split',
  'toLowerCase',
  'toReversed',
  'toSorted',
  'toUpperCase',
  'trim',
]);
const CALLBACK_STEPS = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'flatMap',
  'map',
  'reduce',
  'some',
]);
const PURE_GLOBAL_CALLS = new Set([
  'Array.from',
  'Object.entries',
  'Object.fromEntries',
  'Object.keys',
  'Object.values',
]);
const PURE_CONSTRUCTORS = new Set(['Map', 'Set']);
const PLAIN = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.Property,
  AST_NODE_TYPES.SpreadElement,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.PrivateIdentifier,
  AST_NODE_TYPES.ThisExpression,
  AST_NODE_TYPES.TemplateElement,
]);

function isGlobal(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = variableNamed(sourceCode, node);
  return variable === undefined || variable.defs.length === 0;
}

export function isFsRead(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name : (memberName(callee) ?? '');
  return FS_READS.has(name) && isFsCall(sourceCode, callee);
}

function globalCallName(sourceCode: SourceCode, callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return isGlobal(sourceCode, callee) ? callee.name : undefined;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const owner = unwrapped(callee.object);
  return isGlobal(sourceCode, owner) && owner.type === AST_NODE_TYPES.Identifier
    ? `${owner.name}.${memberName(callee) ?? ''}`
    : undefined;
}

function isPureCallback(sourceCode: SourceCode, fn: TSESTree.Node): boolean {
  if (!isFunction(fn) || fn.async || fn.generator) {
    return false;
  }
  const body = fn.body.type === AST_NODE_TYPES.BlockStatement ? undefined : fn.body;
  return body !== undefined && isPureWork(sourceCode, body);
}

function isPureCall(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  const takesCallback = CALLBACK_STEPS.has(memberName(callee) ?? '');
  const [first] = call.arguments;
  if (takesCallback && (first === undefined || !isPureCallback(sourceCode, first))) {
    return false;
  }
  const pureArguments = call.arguments.every(
    (argument) =>
      isPureCallback(sourceCode, argument) ||
      (!isFunction(argument) && isPureWork(sourceCode, argument)),
  );
  if (!pureArguments) {
    return false;
  }
  if (PURE_GLOBAL_CALLS.has(globalCallName(sourceCode, callee) ?? '')) {
    return true;
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    PURE_STEPS.has(memberName(callee) ?? '') &&
    isPureWork(sourceCode, callee.object)
  );
}

export function isPureWork(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return isPureWork(sourceCode, value.argument);
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return isPureCall(sourceCode, value);
  }
  if (value.type === AST_NODE_TYPES.NewExpression) {
    return (
      value.callee.type === AST_NODE_TYPES.Identifier &&
      PURE_CONSTRUCTORS.has(value.callee.name) &&
      isGlobal(sourceCode, value.callee) &&
      value.arguments.every((argument) => isPureWork(sourceCode, argument))
    );
  }
  return (
    PLAIN.has(value.type) && nodeChildren(value).every((child) => isPureWork(sourceCode, child))
  );
}

function isCostlyStep(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return node.arguments.length > 0;
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(node.callee);
  return (
    PURE_GLOBAL_CALLS.has(globalCallName(sourceCode, callee) ?? '') ||
    CALLBACK_STEPS.has(memberName(callee) ?? '')
  );
}

export function isCostly(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return someNode(node, (child) => isCostlyStep(sourceCode, child));
}
