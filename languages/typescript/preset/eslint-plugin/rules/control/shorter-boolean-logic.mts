import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findShorter } from '../../../../../../shared/logic/shorter/find-shorter.mts';
import { renderSkeleton } from '../../../../../../shared/logic/shorter/render.mts';
import { skeletonOf } from '../../../../../../shared/logic/shorter/skeleton.mts';
import { isNot } from '../../../../../../shared/logic/terms.mts';
import { conditionTerm } from '../decided/facts.mts';
import { chainOf, depthFirst, nodeChildren } from '../typed/node-views.mts';
import { booleanParts } from './boolean-leaves.mts';
import { isNarrowingLeaf } from './narrowing-leaf.mts';
import { isTestOf } from './test-positions.mts';

type Source = Parameters<typeof skeletonOf<undefined>>[1];

const CONNECTIVES = new Set<string>(['&&', '||']);
const TYPE_SYNTAX = new Set<string>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSInstantiationExpression,
]);
const TEST_PARENTS = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ConditionalExpression,
]);

function singleLine(text: string): string {
  return text.replaceAll(/\s+/gu, ' ');
}

function isConnective(node: TSESTree.Node | undefined): boolean {
  if (node?.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator === '!';
  }
  return node?.type === AST_NODE_TYPES.LogicalExpression && CONNECTIVES.has(node.operator);
}

function holdsTypeSyntax(node: TSESTree.Node): boolean {
  return [...depthFirst<TSESTree.Node>(node, nodeChildren)].some(({ type }) =>
    TYPE_SYNTAX.has(type),
  );
}

function topOf(node: TSESTree.Node): TSESTree.Node {
  const chain = chainOf(node, (current) =>
    isConnective(current.parent) ? current.parent : undefined,
  );
  return chain.at(-1) ?? node;
}

export const rule: TSESLint.RuleModule<'shorter'> = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description:
        'Report a condition that has an exactly equivalent form with fewer operands, print it, and write it',
    },
    schema: [],
    messages: {
      shorter: '`{{ condition }}` can be written as `{{ form }}`: {{ reason }}.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const seen = new WeakSet<TSESTree.Node>();
    const source: Source = {
      rootContext: undefined,
      children: () => undefined,
      text: ({ range = [0, 0] }) => singleLine(sourceCode.text.slice(...range)),
    };

    function check(node: TSESTree.Node): void {
      const top = topOf(node);
      if (seen.has(top)) {
        return;
      }
      seen.add(top);
      const term = conditionTerm(top, sourceCode);
      const found = findShorter(skeletonOf(term, source), {
        booleanContext: isNot(term) || isTestOf(top, TEST_PARENTS),
        isPinned: isNarrowingLeaf,
        isBoolean: booleanParts(top, sourceCode.parserServices),
      });
      if (found !== undefined) {
        const keepsText = !holdsTypeSyntax(top) && sourceCode.getCommentsInside(top).length === 0;
        const text = renderSkeleton(found.skeleton, undefined, ({ term: leaf }) =>
          sourceCode.text.slice(...(leaf.range ?? [0, 0])),
        );
        context.report({
          node: top,
          messageId: 'shorter',
          ...(keepsText ? { fix: (fixer) => fixer.replaceText(top, text) } : {}),
          data: {
            condition: singleLine(sourceCode.getText(top)),
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
