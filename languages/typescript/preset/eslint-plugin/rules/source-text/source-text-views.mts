import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';

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

export function regexPattern(context: SourceContext, node: TSESTree.Node): string | undefined {
  const target = resolveConstant(context, node);
  if (target?.type === AST_NODE_TYPES.Literal && 'regex' in target) {
    return target.regex.pattern;
  }
  const created =
    (target?.type === AST_NODE_TYPES.NewExpression ||
      target?.type === AST_NODE_TYPES.CallExpression) &&
    target.callee.type === AST_NODE_TYPES.Identifier &&
    target.callee.name === 'RegExp';
  return created ? stringValue(target.arguments[0]) : undefined;
}

export function hasKeyword(pattern: string): boolean {
  return KEYWORD_PATTERN.test(pattern);
}

function peel(node: TSESTree.Node): TSESTree.Node {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return peel(node.argument);
  }
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.ChainExpression
  ) {
    return peel(node.expression);
  }
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.arguments.length === 0 &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.property) === 'toString'
  ) {
    return peel(node.callee.object);
  }
  return node;
}

function pathText(node: TSESTree.Node | undefined): string | undefined {
  if (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    PATH_JOINS.has(nameOf(node.callee.property) ?? '')
  ) {
    return pathText(node.arguments.at(-1));
  }
  if (node?.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.quasis.at(-1)?.value.cooked ?? undefined;
  }
  return stringValue(node);
}

function readsSourceFile(node: TSESTree.Node): boolean {
  const call = peel(node);
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    FILE_READS.has(
      nameOf(
        call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.property : call.callee,
      ) ?? '',
    ) &&
    SOURCE_FILE.test(pathText(call.arguments[0]) ?? '')
  );
}

function calleeName(node: TSESTree.CallExpression | TSESTree.NewExpression): string {
  const callee =
    node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.property : node.callee;
  return nameOf(callee) ?? '';
}

function isMaskingHelper(name: string): boolean {
  return MASKING_HELPER.test(name) || LEXING.test(name);
}

function isJsonCall(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.MemberExpression && nameOf(node.callee.object) === 'JSON'
  );
}

export function passesThroughMasking(
  context: SourceContext,
  node: TSESTree.Node | undefined,
  depth = 0,
): boolean {
  if (node === undefined || depth > 6) {
    return false;
  }
  const value = peel(resolveConstant(context, node) ?? node);
  if (value.type === AST_NODE_TYPES.MemberExpression) {
    return passesThroughMasking(context, value.object, depth + 1);
  }
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const name = calleeName(value);
  if ((MASKING_VALUE.test(name) && !isJsonCall(value)) || isMaskingHelper(name)) {
    return true;
  }
  const inputs = [
    ...(value.callee.type === AST_NODE_TYPES.MemberExpression ? [value.callee.object] : []),
    ...value.arguments,
  ];
  return inputs.some((input) => passesThroughMasking(context, input, depth + 1));
}

function maskedParameter(context: SourceContext, node: TSESTree.Node): boolean {
  const text = peel(node);
  if (text.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = findVariable(context, text, text.name)?.defs[0];
  const fn = definition?.type === 'Parameter' ? definition.node : undefined;
  if (fn === undefined || !isFunctionNode(fn)) {
    return false;
  }
  const index = fn.params.findIndex(
    (param) => param.type === AST_NODE_TYPES.Identifier && param.name === text.name,
  );
  const owner = functionName(fn);
  if (index < 0 || owner === undefined) {
    return false;
  }
  const calls = [...depthFirst<TSESTree.Node>(context.sourceCode.ast, nodeChildren)].filter(
    (candidate): candidate is TSESTree.CallExpression =>
      candidate.type === AST_NODE_TYPES.CallExpression &&
      (candidate.callee.type === AST_NODE_TYPES.MemberExpression
        ? nameOf(candidate.callee.property)
        : nameOf(candidate.callee)) === owner,
  );
  return (
    calls.length > 0 && calls.every((call) => passesThroughMasking(context, call.arguments[index]))
  );
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

export function holdsSourceText(context: SourceContext, node: TSESTree.Node): boolean {
  const text = peel(node);
  if (text.type === AST_NODE_TYPES.Identifier && SOURCE_NAMES.has(text.name)) {
    return !maskedParameter(context, text) && !passesThroughMasking(context, text);
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
