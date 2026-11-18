import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { splitCallOf } from '../text-splits/split-calls.mts';
import { ancestorsOf } from '../typed/node-views.mts';
import { isCommentValue, isFileText } from './file-text.mts';

const LINE_ENDING_AWARE = /\\r|\\u2028|EOL|splitlines|\blines\(/u;
const SEARCHES = new Set(['indexOf', 'lastIndexOf']);

function isNewlineArgument(node: TSESTree.Node | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.Literal) {
    return (
      node.value === '\n' ||
      ('regex' in node && node.regex.pattern === '\\n' && node.regex.flags === '')
    );
  }
  return (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0 &&
    node.quasis[0]?.value.cooked === '\n'
  );
}

function searchReceiver(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = node;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    SEARCHES.has(callee.property.name) &&
    isNewlineArgument(node.arguments[0])
    ? callee.object
    : undefined;
}

function regexSplitReceiver(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = node;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'split' &&
    node.arguments.length === 1 &&
    isNewlineArgument(node.arguments[0])
    ? callee.object
    : undefined;
}

export const rule: TSESLint.RuleModule<'newlineOnly'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require text read from a file or a comment to be split on every line terminator',
    },
    schema: [],
    messages: {
      newlineOnly:
        'Split on every line terminator: `text.split(/\\r\\n|\\r|\\n/)` (`/\\r?\\n/` when only CRLF and LF matter), or normalise the line endings once where the file is read. Splitting only on `"\\n"` leaves a `\\r` on every line of a CRLF file, so comparisons, regular expressions and code frames are off, and text that uses `\\r` is not split at all. Text the program generated itself is fine.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    function check(node: TSESTree.Node, receiver: TSESTree.Node): void {
      const scope = ancestorsOf(node).find(
        (ancestor) => isFunctionNode(ancestor) || ancestor.type === AST_NODE_TYPES.Program,
      );
      if (
        (isFileText(context, receiver) || isCommentValue(receiver)) &&
        !(scope !== undefined && LINE_ENDING_AWARE.test(sourceCode.getText(scope)))
      ) {
        context.report({ node, messageId: 'newlineOnly' });
      }
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const split = splitCallOf(context, node);
        const receiver =
          split?.separator === '\n' && !split.limited
            ? split.receiver
            : (searchReceiver(node) ?? regexSplitReceiver(node));
        if (receiver !== undefined) {
          check(node, receiver);
        }
      },
    };
  },
};
