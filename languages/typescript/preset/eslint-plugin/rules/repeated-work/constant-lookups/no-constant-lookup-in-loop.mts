import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { constantArguments } from '../../reuse/constant-arguments.mts';
import { innermostRepeat } from '../support/loop-invariance.mts';
import { isDocumentLookup, leavesPageAlone } from './dom-quiet.mts';
import { isConstantUrlRead } from './url-reads.mts';

type MessageId = 'domLookup' | 'urlParse';

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow looking up the same element or parsing the same URL by a constant on every pass of a loop',
    },
    schema: [],
    messages: {
      domLookup:
        '`{{call}}` looks up the same element on every pass of this loop or callback: its arguments are constants and nothing in the loop changes the page. Look it up once before the loop and reuse the element.',
      urlParse:
        '`new URL({{argument}})` parses the same constant URL on every pass of this loop or callback, and only its parts are read. Parse it once at module scope or before the loop and read the parts from that object.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    function check(node: TSESTree.CallExpression | TSESTree.NewExpression): void {
      if (node.arguments.length === 0 || !constantArguments(context, node)) {
        return;
      }
      const repeat = innermostRepeat(node);
      if (repeat === undefined) {
        return;
      }
      if (isDocumentLookup(sourceCode, node) && leavesPageAlone(sourceCode, repeat.node)) {
        context.report({
          node,
          messageId: 'domLookup',
          data: {
            call: `${sourceCode.getText(node.callee)}(${sourceCode.getText(node.arguments[0])})`,
          },
        });
      } else if (isConstantUrlRead(sourceCode, node)) {
        context.report({
          node,
          messageId: 'urlParse',
          data: { argument: sourceCode.getText(node.arguments[0]) },
        });
      }
    }
    return { CallExpression: check, NewExpression: check };
  },
};
