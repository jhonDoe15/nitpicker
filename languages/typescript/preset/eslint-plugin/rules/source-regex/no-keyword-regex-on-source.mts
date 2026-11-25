import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';
import { keywordInPattern, regexPatternOf } from './keyword-patterns.mts';
import { hasPriorStripping } from './prior-stripping.mts';
import { holdsSourceCode } from './source-text.mts';

type MessageId = 'keywordRegexOnSource';

const REGEX_METHODS = new Set<string>(['test', 'exec']);
const STRING_REGEX_METHODS = new Set<string>([
  'match',
  'matchAll',
  'replace',
  'replaceAll',
  'search',
  'split',
]);

type RegexApplication = {
  readonly regexNode: TSESTree.Node;
  readonly textNode: TSESTree.Node;
};

function regexApplicationOf(node: TSESTree.CallExpression): RegexApplication | undefined {
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const method = nameOf(callee.property);
  const [firstArg] = node.arguments;
  if (
    method === undefined ||
    firstArg === undefined ||
    firstArg.type === AST_NODE_TYPES.SpreadElement
  ) {
    return undefined;
  }
  if (REGEX_METHODS.has(method)) {
    return { regexNode: callee.object, textNode: firstArg };
  }
  if (STRING_REGEX_METHODS.has(method)) {
    return { regexNode: firstArg, textNode: callee.object };
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow matching programming-language keywords with regexes against source text without skipping comments and string literals first',
    },
    schema: [],
    messages: {
      keywordRegexOnSource:
        'Matching language keyword `{{ keyword }}` with a regex against source text can match inside comments or string literals. Use a parser or tokenizer, or strip comments and string literals first.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const application = regexApplicationOf(node);
        if (application === undefined) {
          return;
        }
        const pattern = regexPatternOf(context, application.regexNode);
        if (pattern === undefined) {
          return;
        }
        const keyword = keywordInPattern(pattern);
        if (keyword === undefined) {
          return;
        }
        if (
          holdsSourceCode(context, application.textNode) &&
          !hasPriorStripping(context, node, application.textNode)
        ) {
          context.report({
            node,
            messageId: 'keywordRegexOnSource',
            data: { keyword },
          });
        }
      },
    };
  },
};
