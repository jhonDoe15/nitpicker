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

function callbackBody(fn: TSESTree.Node): TSESTree.Node | undefined {
  if (
    !isFunction(fn) ||
    fn.async ||
    fn.generator ||
    fn.body.type === AST_NODE_TYPES.BlockStatement
  ) {
    return undefined;
  }
  return fn.body;
}

function argumentParts(call: TSESTree.CallExpression): TSESTree.Node[] | undefined {
  const parts: TSESTree.Node[] = [];
  for (const argument of call.arguments) {
    const part = isFunction(argument) ? callbackBody(argument) : argument;
    if (part === undefined) {
      return undefined;
    }
    parts.push(part);
  }
  return parts;
}

function callParts(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): TSESTree.Node[] | undefined {
  const callee = unwrapped(call.callee);
  const takesCallback = CALLBACK_STEPS.has(memberName(callee) ?? '');
  const [first] = call.arguments;
  if (takesCallback && (first === undefined || callbackBody(first) === undefined)) {
    return undefined;
  }
  const parts = argumentParts(call);
  if (parts === undefined) {
    return undefined;
  }
  if (PURE_GLOBAL_CALLS.has(globalCallName(sourceCode, callee) ?? '')) {
    return parts;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && PURE_STEPS.has(memberName(callee) ?? '')
    ? [callee.object, ...parts]
    : undefined;
}

function pureParts(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node[] | undefined {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return [value.argument];
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return callParts(sourceCode, value);
  }
  if (value.type === AST_NODE_TYPES.NewExpression) {
    return value.callee.type === AST_NODE_TYPES.Identifier &&
      PURE_CONSTRUCTORS.has(value.callee.name) &&
      isGlobal(sourceCode, value.callee)
      ? value.arguments
      : undefined;
  }
  return PLAIN.has(value.type) ? nodeChildren(value) : undefined;
}

export function isPureWork(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const pending = [node];
  for (const item of pending) {
    const parts = pureParts(sourceCode, item);
    if (parts === undefined) {
      return false;
    }
    for (const part of parts) {
      pending.push(part);
    }
  }
  return true;
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
