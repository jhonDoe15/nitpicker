import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findShorter as untypedFindShorter } from '../../../../../../shared/logic/shorter/find-shorter.mjs';
import { skeletonOf as untypedSkeletonOf } from '../../../../../../shared/logic/shorter/skeleton.mjs';
import { isNot as untypedIsNot } from '../../../../../../shared/logic/terms.mjs';
import type { Term } from '../analysis/logic/term-views.mts';
import { conditionTerm } from '../decided/facts.mts';
import { chainOf } from '../typed/node-views.mts';
import { booleanParts } from './boolean-leaves.mts';
import { isNarrowingLeaf } from './narrowing-leaf.mts';
import { isTestOf } from './test-positions.mts';

type Leaf = { readonly op: 'leaf'; readonly term: Term; readonly text: string };
type Skeleton = object;
type Found = { readonly form: string; readonly reasons: readonly string[] };
type Options = {
  readonly booleanContext: boolean;
  readonly isPinned: (leaf: Leaf, leaves: readonly Leaf[]) => boolean;
  readonly isBoolean: (leaf: Leaf) => boolean;
};
type Source = {
  readonly rootContext: undefined;
  readonly children: () => undefined;
  readonly text: (term: Term) => string;
};

const findShorter: (skeleton: Skeleton, options: Options) => Found | undefined = untypedFindShorter;
const skeletonOf: (root: Term, source: Source) => Skeleton = untypedSkeletonOf;
const isNot: (node: Term) => boolean = untypedIsNot;

const CONNECTIVES = new Set<string>(['&&', '||']);
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

function topOf(node: TSESTree.Node): TSESTree.Node {
  const chain = chainOf(node, (current) =>
    isConnective(current.parent) ? current.parent : undefined,
  );
  return chain.at(-1) ?? node;
}

export const rule: TSESLint.RuleModule<'shorter'> = {
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
        context.report({
          node: top,
          messageId: 'shorter',
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
