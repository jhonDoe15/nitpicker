import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, type SourceContext } from '../analysis/constant-resolution.mts';
import { ancestorsOf, nameOf, nodeChildren, nodesWithoutNested } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';
import { isCommentPattern, regexPatternOf } from './keyword-patterns.mts';
import { callMethodName, splitWords } from './source-text.mts';

const STRIP_VERBS = new Set<string>([
  'strip',
  'mask',
  'remove',
  'skip',
  'blank',
  'clear',
  'erase',
  'scrub',
  'clean',
  'filter',
  'sanitize',
  'redact',
  'drop',
  'omit',
  'ignore',
  'without',
]);

const STRIP_TARGETS = new Set<string>([
  'comment',
  'comments',
  'string',
  'strings',
  'literal',
  'literals',
  'code',
  'noncode',
  'trivia',
]);

const TOKENIZER_WORDS = new Set<string>(['tokenize', 'tokenizer', 'lex', 'lexer']);

const PARSE_TARGETS = new Set<string>([
  'source',
  'code',
  'ast',
  'module',
  'script',
  'program',
  'file',
]);

const NESTED_FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
]);

function isStrippingHelperCall(node: TSESTree.CallExpression): boolean {
  const name = callMethodName(node);
  if (name === undefined) {
    return false;
  }
  if (name === 'createSourceFile') {
    return true;
  }
  const words = splitWords(name);
  if (words.some((word) => TOKENIZER_WORDS.has(word))) {
    return true;
  }
  if (words.includes('parse') && words.some((word) => PARSE_TARGETS.has(word))) {
    return true;
  }
  return (
    words.some((word) => STRIP_VERBS.has(word)) && words.some((word) => STRIP_TARGETS.has(word))
  );
}

function isCommentReplaceCall(context: SourceContext, node: TSESTree.CallExpression): boolean {
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const method = nameOf(callee.property);
  const [patternArg] = node.arguments;
  if (
    (method !== 'replace' && method !== 'replaceAll') ||
    patternArg === undefined ||
    patternArg.type === AST_NODE_TYPES.SpreadElement
  ) {
    return false;
  }
  const pattern = regexPatternOf(context, patternArg);
  return pattern !== undefined && isCommentPattern(pattern);
}

export function hasPriorStripping(
  context: SourceContext,
  callNode: TSESTree.CallExpression,
  textNode: TSESTree.Node,
): boolean {
  const scopeRoot = ancestorsOf(callNode).find(
    (ancestor) => isFunctionNode(ancestor) || ancestor.type === AST_NODE_TYPES.Program,
  );
  if (scopeRoot === undefined) {
    return false;
  }
  for (const node of nodesWithoutNested(scopeRoot, NESTED_FUNCTIONS, nodeChildren)) {
    if (node.type !== AST_NODE_TYPES.CallExpression || node === callNode) {
      continue;
    }
    const isBefore = node.range[1] <= callNode.range[0];
    const isInsideText = textNode.range[0] <= node.range[0] && node.range[1] <= textNode.range[1];
    if (!isBefore && !isInsideText) {
      continue;
    }
    if (isStrippingHelperCall(node) || isCommentReplaceCall(context, node)) {
      return true;
    }
  }
  return false;
}
