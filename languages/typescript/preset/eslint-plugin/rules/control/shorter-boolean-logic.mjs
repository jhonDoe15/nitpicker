import { findShorter } from '../../../../../../shared/logic/shorter/find-shorter.mjs';
import { skeletonOf } from '../../../../../../shared/logic/shorter/skeleton.mjs';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { isNot } from '../../../../../../shared/logic/terms.mjs';
import { booleanParts } from './boolean-leaves.mjs';
import { conditionTerm } from '../decided/facts.mjs';
import { isNarrowingLeaf } from './narrowing-leaf.mjs';

const CONNECTIVES = new Set(['&&', '||']);
const TEST_PARENTS = new Set([
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ConditionalExpression',
]);

function isConnective(node) {
  return node?.type === 'UnaryExpression'
    ? node.operator === '!'
    : node?.type === 'LogicalExpression' && CONNECTIVES.has(node.operator);
}

function topOf(node) {
  return chainOf(node, (current) => (isConnective(current.parent) ? current.parent : undefined)).at(
    -1,
  );
}

function isTestPosition(node) {
  const { parent } = node;
  return TEST_PARENTS.has(parent.type) && parent.test === node;
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Report a condition that has an exactly equivalent form with fewer operands, and print it',
    },
    schema: [],
    messages: {
      shorter: '`{{ condition }}` can be written as `{{ form }}`: {{ reason }}.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const seen = new WeakSet();
    const source = {
      rootContext: undefined,
      children: () => undefined,
      text: (leaf) => sourceCode.text.slice(...leaf.range).replaceAll(/\s+/gu, ' '),
    };

    function check(node) {
      const top = topOf(node);
      if (seen.has(top)) {
        return;
      }
      seen.add(top);
      const term = conditionTerm(top, sourceCode);
      const found = findShorter(skeletonOf(term, source), {
        booleanContext: isNot(term) || isTestPosition(top),
        isPinned: isNarrowingLeaf,
        isBoolean: booleanParts(top, sourceCode.parserServices),
      });
      if (found !== undefined) {
        context.report({
          node: top,
          messageId: 'shorter',
          data: {
            condition: sourceCode.getText(top).replaceAll(/\s+/gu, ' '),
            form: found.form,
            reason: found.reasons.join('; '),
          },
        });
      }
    }

    return {
      LogicalExpression(node) {
        if (isConnective(node)) {
          check(node);
        }
      },
    };
  },
};
