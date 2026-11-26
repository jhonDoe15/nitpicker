import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { enclosingFunction } from '../typed/syntax-views.mts';
import {
  hasKeyword,
  holdsSourceText,
  regexPattern,
  skipsCommentsIn,
} from './source-text-views.mts';

const TEXT_METHODS = new Set(['match', 'matchAll', 'replace', 'replaceAll', 'split', 'search']);
const REGEX_METHODS = new Set(['test', 'exec']);

type Pair = [TSESTree.Node, TSESTree.Node | undefined];

function textAndRegex(
  method: string,
  object: TSESTree.Node,
  first: TSESTree.Node | undefined,
): Pair | undefined {
  if (TEXT_METHODS.has(method)) {
    return [object, first];
  }
  return REGEX_METHODS.has(method) ? [first ?? object, object] : undefined;
}

export const rule: TSESLint.RuleModule<'keywordRegex'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow matching a language keyword with a regex over raw source text',
    },
    schema: [],
    messages: {
      keywordRegex:
        'This matches a keyword of a programming language with a regular expression over raw source text, so comments, strings and text blocks match as well ("in this case" matches case). Use a parser or a tokenizer, or strip comments and strings first (and add a call such as stripComments to this function).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
          return;
        }
        const method = nameOf(callee.property) ?? '';
        const [first] = node.arguments;
        const pair = textAndRegex(method, callee.object, first);
        if (pair === undefined || pair[1] === undefined || first === undefined) {
          return;
        }
        const [text, regex] = pair;
        const pattern = regexPattern(context, regex);
        if (
          pattern !== undefined &&
          hasKeyword(pattern) &&
          holdsSourceText(context, text) &&
          !skipsCommentsIn(enclosingFunction(node) ?? context.sourceCode.ast)
        ) {
          context.report({ node, messageId: 'keywordRegex' });
        }
      },
    };
  },
};
