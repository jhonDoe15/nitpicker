import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
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
const SKIPS_COMMENTS = /strip|mask|removeComments|blank|tokeni[sz]e|parse/iu;
const LEXING = /^lex|[a-z]Lex/u;

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

export function holdsSourceText(context: SourceContext, node: TSESTree.Node): boolean {
  const text = peel(node);
  if (text.type === AST_NODE_TYPES.Identifier && SOURCE_NAMES.has(text.name)) {
    return true;
  }
  const resolved = text.type === AST_NODE_TYPES.Identifier ? resolveConstant(context, text) : text;
  return resolved !== undefined && readsSourceFile(resolved);
}

export function skipsCommentsIn(scope: TSESTree.Node): boolean {
  return [...depthFirst<TSESTree.Node>(scope, nodeChildren)].some((node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression && node.type !== AST_NODE_TYPES.NewExpression) {
      return false;
    }
    const callee =
      node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.property : node.callee;
    const name = nameOf(callee) ?? '';
    return SKIPS_COMMENTS.test(name) || LEXING.test(name);
  });
}
