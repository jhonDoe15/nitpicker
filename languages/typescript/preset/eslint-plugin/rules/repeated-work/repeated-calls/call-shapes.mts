import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { libraryBinding, variableOf } from '../../../../libraries/module-bindings.mts';
import {
  memberChain,
  memberName,
  someNode,
} from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isFunction, unwrapped } from '../../typed/syntax-views.mts';

const CHEAP = new Set([
  'at',
  'basename',
  'dirname',
  'extname',
  'padEnd',
  'padStart',
  'replace',
  'replaceAll',
  'slice',
  'split',
  'substr',
  'substring',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimStart',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'endsWith',
  'get',
  'getAttribute',
  'getItem',
  'has',
  'hasOwnProperty',
  'includes',
  'indexOf',
  'item',
  'size',
  'startsWith',
  'toString',
  'valueOf',
]);
const VERBS = [
  'accept',
  'acquire',
  'add',
  'advance',
  'append',
  'apply',
  'call',
  'clear',
  'close',
  'consume',
  'create',
  'dec',
  'decrement',
  'delete',
  'dequeue',
  'eat',
  'emit',
  'enqueue',
  'exec',
  'expect',
  'fetch',
  'generate',
  'inc',
  'increment',
  'insert',
  'lex',
  'match',
  'next',
  'now',
  'open',
  'poll',
  'pop',
  'post',
  'push',
  'put',
  'random',
  'read',
  'release',
  'remove',
  'reset',
  'run',
  'save',
  'scan',
  'send',
  'set',
  'shift',
  'skip',
  'splice',
  'start',
  'stop',
  'take',
  'test',
  'unshift',
  'update',
  'uuid',
  'write',
];
const FS_PACKAGES = ['fs', 'node:fs', 'fs/promises', 'node:fs/promises', 'fs-extra'];
const KEPT_GLOBALS = new Set(['JSON', 'structuredClone']);
const UNSETTLED = new Set<string>([
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.ImportExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.TaggedTemplateExpression,
  AST_NODE_TYPES.UpdateExpression,
  AST_NODE_TYPES.YieldExpression,
]);

export function isVerb(rawName: string): boolean {
  const name = rawName.replace(/^[_$#]+/u, '');
  return VERBS.some(
    (verb) =>
      name === verb || (name.startsWith(verb) && /^[A-Z_$\d]/u.test(name.charAt(verb.length))),
  );
}

export function isSettled(node: TSESTree.Node): boolean {
  return !someNode(node, (child) => UNSETTLED.has(child.type) || isFunction(child));
}

function calleeName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
}

function isGlobalHelper(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  const root = memberChain(callee).at(-1);
  if (root?.type !== AST_NODE_TYPES.Identifier || KEPT_GLOBALS.has(root.name)) {
    return false;
  }
  const variable = variableNamed(sourceCode, root);
  return variable === undefined || variable.defs.length === 0;
}

export function isCostlyPureLooking(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): boolean {
  const callee = unwrapped(call.callee);
  const name = calleeName(callee);
  return (
    name !== undefined &&
    call.arguments.length > 0 &&
    !CHEAP.has(name) &&
    !isVerb(name) &&
    !isGlobalHelper(sourceCode, callee) &&
    isSettled(callee) &&
    call.arguments.every((argument) => isSettled(argument))
  );
}

export function sameCall(sourceCode: SourceCode, first: TSESTree.Node, second: TSESTree.Node) {
  const text = (node: TSESTree.Node) =>
    sourceCode
      .getTokens(node)
      .map((token) => token.value)
      .join(' ');
  return text(first) === text(second);
}

export function isFsCall(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  const root = memberChain(callee).at(-1);
  return (
    root?.type === AST_NODE_TYPES.Identifier &&
    libraryBinding(variableOf(sourceCode, root), FS_PACKAGES) !== undefined
  );
}
