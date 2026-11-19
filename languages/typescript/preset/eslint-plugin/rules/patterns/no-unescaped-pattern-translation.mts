import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mts';
import { dependsOnInput } from '../regex/input-dependence.mts';
import { typeServices, unwrapped } from '../security/security-values.mts';
import { flowsToRegExp } from './regex-sinks.mts';
import {
  isChainTop,
  isEscapedRoot,
  isEscapingLink,
  replaceChainAt,
  type Chain,
} from './replace-chains.mts';

type MessageId = 'regexTranslation' | 'likeTranslation';
type Context = TSESLint.RuleContext<MessageId, readonly unknown[]>;

const REGEX_TOKENS = new Set<string>([
  '.*',
  '.+',
  '.',
  '.?',
  '(.*)',
  '(.+)',
  '[^/]*',
  '[^/]+',
  '[^/]',
  '([^/]*)',
  '([^/]+)',
  '[^\\/]*',
  '[^\\/]+',
  '[\\s\\S]*',
  '[\\s\\S]+',
]);
const LIKE_TOKENS = new Set<string>(['%', '_']);

function isConstantRoot(context: Context, root: TSESTree.Node): boolean {
  const resolved = unwrapped(resolveConstant(context, root));
  return (
    stringValue(resolved) !== undefined ||
    (resolved?.type === AST_NODE_TYPES.TemplateLiteral && resolved.expressions.length === 0)
  );
}

function translation(chain: Chain): MessageId | undefined {
  const replacements = chain.links.map(({ replacement }) => replacement ?? '');
  const likes = replacements.filter((replacement) => LIKE_TOKENS.has(replacement));
  if (likes.includes('%') && likes.length >= 2) {
    return 'likeTranslation';
  }
  return replacements.some((replacement) => REGEX_TOKENS.has(replacement))
    ? 'regexTranslation'
    : undefined;
}

function isUncoveredRegexFlow(
  context: Context,
  node: TSESTree.CallExpression,
  chain: Chain,
): boolean {
  const flow = flowsToRegExp(context, node);
  if (flow === undefined) {
    return false;
  }
  const typed = typeServices(context) !== undefined;
  return flow === 'whole' || !typed || !dependsOnInput(context, chain.root);
}

function check(context: Context, node: TSESTree.CallExpression): void {
  if (!isChainTop(node)) {
    return;
  }
  const chain = replaceChainAt(node);
  if (chain.links.length < 2) {
    return;
  }
  const kind = translation(chain);
  if (
    kind === undefined ||
    chain.links.some(isEscapingLink) ||
    isEscapedRoot(chain.root) ||
    isConstantRoot(context, chain.root)
  ) {
    return;
  }
  if (kind === 'likeTranslation' || isUncoveredRegexFlow(context, node, chain)) {
    context.report({ node, messageId: kind });
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow turning a glob, regex or LIKE pattern into another pattern language with replace calls that leave the target metacharacters unescaped',
    },
    schema: [],
    messages: {
      regexTranslation:
        'This chain of `replace` calls turns a glob or pattern into a regex without escaping the regex metacharacters first, so a `.`, `+`, `(` or `$` in the value changes what matches. Escape first (`escapeRegExp(value)`) and restore the wildcards from their escaped form (`\\*\\*` to `.*`), or tokenise the pattern and map each token, or use a glob library.',
      likeTranslation:
        "This chain of `replace` calls builds a SQL `LIKE` pattern without escaping `%`, `_` and the escape character first, so those characters in the value act as wildcards. Escape them (`replace(/[\\\\%_]/g, '\\\\$&')`) before mapping the wildcards, add `ESCAPE '\\\\'`, or tokenise the pattern and map each token.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        check(context, node);
      },
    };
  },
};
