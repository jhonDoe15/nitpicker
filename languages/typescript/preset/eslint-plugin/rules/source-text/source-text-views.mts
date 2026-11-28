import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { chainOf, depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
import { optionalText, textOf } from '../../../../../../shared/values/readers.mts';

const { DefinitionType } = TSESLint.Scope;
type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
const MAX_MASKING_DEPTH = 6;
const KEYWORDS = [
  'abstract',
  'async',
  'await',
  'case',
  'catch',
  'class',
  'const',
  'def',
  'elif',
  'enum',
  'export',
  'extends',
  'final',
  'finally',
  'fun',
  'func',
  'function',
  'implements',
  'import',
  'instanceof',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  'require',
  'return',
  'static',
  'struct',
  'switch',
  'synchronized',
  'throw',
  'throws',
  'try',
  'typeof',
  'yield',
];
const KEYWORD_PATTERN = new RegExp(
  String.raw`\\b(?:\((?:\?:)?)?(?:${KEYWORDS.join('|')})(?:\\b|\\s|\\\(|[|)])`,
  'u',
);
const SOURCE_NAMES = new Set(['source', 'sourceText', 'sourceCode', 'sourceContent']);
const SOURCE_FILE = /\.(?:java|ts|tsx|mts|cts|js|jsx|mjs|cjs|py|kt|go)$/u;
const FILE_READS = new Set(['readFileSync', 'readFile', 'readText']);
const MASKING_HELPER =
  /(?:strip|mask|blank)\w*(?:comment|string|literal)|removeComments|tokeni[sz]e|^lex/iu;
const LEXING = /[a-z]Lex/u;
const MASKING_VALUE = /^(?:strip|mask|blank|parse)/iu;
const PATH_JOINS = new Set(['join', 'resolve']);

function regExpArgument(target: TSESTree.Node | undefined): string | undefined {
  const created =
    (target?.type === AST_NODE_TYPES.NewExpression ||
      target?.type === AST_NODE_TYPES.CallExpression) &&
    target.callee.type === AST_NODE_TYPES.Identifier &&
    target.callee.name === 'RegExp';
  return created ? stringValue(target.arguments[0]) : undefined;
}

export function regexPattern(context: SourceContext, node: TSESTree.Node): string | undefined {
  const target = resolveConstant(context, node);
  if (target?.type === AST_NODE_TYPES.Literal && 'regex' in target) {
    return target.regex.pattern;
  }
  return regExpArgument(target);
}

export function hasKeyword(pattern: string): boolean {
  return KEYWORD_PATTERN.test(pattern);
}

function toStringReceiver(node: TSESTree.Node): TSESTree.Node | undefined {
  return node.type === AST_NODE_TYPES.CallExpression &&
    node.arguments.length === 0 &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.property) === 'toString'
    ? node.callee.object
    : undefined;
}

function peeled(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.ChainExpression
  ) {
    return node.expression;
  }
  return toStringReceiver(node);
}

function peel(node: TSESTree.Node): TSESTree.Node {
  const inner = peeled(node);
  return inner === undefined ? node : peel(inner);
}

function lastJoinArgument(node: TSESTree.Node | undefined): TSESTree.Node | undefined {
  return node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    PATH_JOINS.has(textOf(nameOf(node.callee.property)))
    ? node.arguments.at(-1)
    : undefined;
}

function pathText(node: TSESTree.Node | undefined): string | undefined {
  const last = chainOf(node, lastJoinArgument).at(-1);
  if (last?.type === AST_NODE_TYPES.TemplateLiteral) {
    return optionalText(last.quasis.at(-1)?.value.cooked);
  }
  return stringValue(last);
}

function calleeNode(node: TSESTree.CallExpression | TSESTree.NewExpression): TSESTree.Node {
  return node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.property : node.callee;
}

function calleeName(node: TSESTree.CallExpression | TSESTree.NewExpression): string {
  return textOf(nameOf(calleeNode(node)));
}

function readsSourceFile(node: TSESTree.Node): boolean {
  const call = peel(node);
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    FILE_READS.has(calleeName(call)) &&
    SOURCE_FILE.test(textOf(pathText(call.arguments[0])))
  );
}

function isMaskingHelper(name: string): boolean {
  return MASKING_HELPER.test(name) || LEXING.test(name);
}

function isJsonCall(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.MemberExpression && nameOf(node.callee.object) === 'JSON'
  );
}

type Pending = { readonly node: TSESTree.Node | undefined; readonly depth: number };

function maskingInputs(value: TSESTree.CallExpression): TSESTree.Node[] {
  return [
    ...(value.callee.type === AST_NODE_TYPES.MemberExpression ? [value.callee.object] : []),
    ...value.arguments,
  ];
}

function maskingChildren(value: TSESTree.Node | undefined): TSESTree.Node[] {
  if (value?.type === AST_NODE_TYPES.MemberExpression) {
    return [value.object];
  }
  return value?.type === AST_NODE_TYPES.CallExpression ? maskingInputs(value) : [];
}

function isMaskingCall(value: TSESTree.CallExpression): boolean {
  const name = calleeName(value);
  return (MASKING_VALUE.test(name) && !isJsonCall(value)) || isMaskingHelper(name);
}

function passesThroughMasking(context: SourceContext, start: TSESTree.Node | undefined): boolean {
  const pending: Pending[] = [{ node: start, depth: 0 }];
  const seen = new Set<TSESTree.Node>();
  for (const { node, depth } of pending) {
    if (node === undefined || depth > MAX_MASKING_DEPTH || seen.has(node)) {
      continue;
    }
    seen.add(node);
    const value = chainOf(resolveConstant(context, node), peeled).at(-1);
    if (value?.type === AST_NODE_TYPES.CallExpression && isMaskingCall(value)) {
      return true;
    }
    pending.push(...maskingChildren(value).map((child) => ({ node: child, depth: depth + 1 })));
  }
  return false;
}

function functionName(fn: TSESTree.Node): string | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return nameOf(fn.id);
  }
  const { parent } = fn;
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator) {
    return nameOf(parent.id);
  }
  return parent?.type === AST_NODE_TYPES.MethodDefinition ||
    parent?.type === AST_NODE_TYPES.Property
    ? nameOf(parent.key)
    : undefined;
}

function parameterOwner(
  context: SourceContext,
  text: TSESTree.Identifier,
): FunctionNode | undefined {
  const definition = findVariable(context, text, text.name)?.defs[0];
  const fn = definition?.type === DefinitionType.Parameter ? definition.node : undefined;
  return isFunctionNode(fn) ? fn : undefined;
}

function parameterSlot(
  context: SourceContext,
  text: TSESTree.Identifier,
): { readonly owner: string; readonly index: number } | undefined {
  const fn = parameterOwner(context, text);
  if (fn === undefined) {
    return undefined;
  }
  const index = fn.params.findIndex(
    (param) => param.type === AST_NODE_TYPES.Identifier && param.name === text.name,
  );
  const owner = functionName(fn);
  return index < 0 || owner === undefined ? undefined : { owner, index };
}

function callsNamed(context: SourceContext, owner: string): TSESTree.CallExpression[] {
  return [...depthFirst<TSESTree.Node>(context.sourceCode.ast, nodeChildren)].filter(
    (candidate): candidate is TSESTree.CallExpression =>
      candidate.type === AST_NODE_TYPES.CallExpression && nameOf(calleeNode(candidate)) === owner,
  );
}

function maskedParameter(context: SourceContext, text: TSESTree.Identifier): boolean {
  const slot = parameterSlot(context, text);
  if (slot === undefined) {
    return false;
  }
  const calls = callsNamed(context, slot.owner);
  return (
    calls.length > 0 &&
    calls.every((call) => passesThroughMasking(context, call.arguments[slot.index]))
  );
}

export function holdsSourceText(context: SourceContext, node: TSESTree.Node): boolean {
  const text = peel(node);
  if (text.type === AST_NODE_TYPES.Identifier && SOURCE_NAMES.has(text.name)) {
    return !(maskedParameter(context, text) || passesThroughMasking(context, text));
  }
  const resolved = text.type === AST_NODE_TYPES.Identifier ? resolveConstant(context, text) : text;
  return resolved !== undefined && readsSourceFile(resolved);
}

export function skipsCommentsIn(scope: TSESTree.Node): boolean {
  return [...depthFirst<TSESTree.Node>(scope, nodeChildren)].some(
    (node) =>
      (node.type === AST_NODE_TYPES.CallExpression || node.type === AST_NODE_TYPES.NewExpression) &&
      isMaskingHelper(calleeName(node)),
  );
}
