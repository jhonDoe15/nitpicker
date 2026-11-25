import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { unwrapped } from '../typed/syntax-views.mts';

const LANGUAGE_KEYWORDS = new Set<string>([
  'abstract',
  'async',
  'await',
  'case',
  'catch',
  'class',
  'const',
  'def',
  'delete',
  'enum',
  'export',
  'extends',
  'from',
  'function',
  'implements',
  'import',
  'interface',
  'let',
  'new',
  'package',
  'private',
  'protected',
  'public',
  'require',
  'return',
  'static',
  'struct',
  'switch',
  'throw',
  'try',
  'typeof',
  'var',
  'yield',
]);

function regExpPatternArgument(node: TSESTree.Node): TSESTree.Expression | undefined {
  if (node.type !== AST_NODE_TYPES.NewExpression && node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== 'RegExp') {
    return undefined;
  }
  const [first] = node.arguments;
  return first !== undefined && first.type !== AST_NODE_TYPES.SpreadElement ? first : undefined;
}

export function isCommentPattern(pattern: string): boolean {
  return /(?:\\?\/\\\*|\\?\/\\?\/)/.test(pattern);
}

export function regexPatternOf(context: SourceContext, node: TSESTree.Node): string | undefined {
  const target = resolveConstant(context, unwrapped(node));
  if (target === undefined) {
    return undefined;
  }
  if (target.type === AST_NODE_TYPES.Literal && 'regex' in target) {
    return target.regex.pattern;
  }
  const first = regExpPatternArgument(target);
  if (first === undefined) {
    return undefined;
  }
  const resolved = resolveConstant(context, unwrapped(first));
  if (resolved?.type === AST_NODE_TYPES.Literal && 'regex' in resolved) {
    return resolved.regex.pattern;
  }
  return stringValue(resolved);
}

function directKeywordIn(pattern: string): string | undefined {
  for (const match of pattern.matchAll(
    /(?:^|[^\\])(?:\\\\)*\\b([a-zA-Z0-9_]+)(?:\\b|\\s|\\\(| )/g,
  )) {
    const word = match[1];
    if (word !== undefined && LANGUAGE_KEYWORDS.has(word)) {
      return word;
    }
  }
  return undefined;
}

function groupedKeywordIn(pattern: string): string | undefined {
  for (const match of pattern.matchAll(
    /(?:^|[^\\])(?:\\\\)*\\b\((?:\?:)?([^()]+)\)(?:\\b|\\s|\\\(| )/g,
  )) {
    const group = match[1];
    if (group === undefined) {
      continue;
    }
    const found = group.split('|').find((branch) => LANGUAGE_KEYWORDS.has(branch));
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function keywordInPattern(pattern: string): string | undefined {
  if (isCommentPattern(pattern)) {
    return undefined;
  }
  return directKeywordIn(pattern) ?? groupedKeywordIn(pattern);
}
