import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Term } from '../analysis/logic/estree-terms.mts';
import { isLogical, key, print } from '../analysis/logic/term-views.mts';
import { chainOf, depthFirst, type SourceCode } from '../typed/node-views.mts';
import {
  comparisonVerdict,
  constantComparison,
  type ConstantComparison,
  type Verdict,
} from './constant-comparisons.mts';
import { isEffectFree, isStable, normalTerm } from './operand-terms.mts';

type Operand = { readonly term: Term; readonly key: string; readonly text: string };
type Compared = ConstantComparison & Operand;
export type Slip = {
  readonly messageId: 'repeatedOperand' | 'impossible' | 'always' | 'implied' | 'covered';
  readonly data: Readonly<Record<string, string>>;
};

function isTypeWrapper(
  node: TSESTree.Node,
): node is
  | TSESTree.TSAsExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSTypeAssertion {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion
  );
}

function inner(node: TSESTree.Node): TSESTree.Node {
  return (
    chainOf<TSESTree.Node>(node, (current) =>
      isTypeWrapper(current) ? current.expression : undefined,
    ).at(-1) ?? node
  );
}

function isSameChain(node: TSESTree.Node, operator: string): node is TSESTree.LogicalExpression {
  return node.type === AST_NODE_TYPES.LogicalExpression && node.operator === operator;
}

function sourceOperands(chain: TSESTree.LogicalExpression): TSESTree.Node[] {
  const operator = chain.operator;
  return [
    ...depthFirst<TSESTree.Node>(chain, (node) => {
      const current = inner(node);
      return isSameChain(current, operator) ? [current.left, current.right] : [];
    }),
  ].filter((node) => !isSameChain(inner(node), operator));
}

function termOperands(term: Term, operator: string): Term[] {
  return [
    ...depthFirst<Term>(term, (node) => (isLogical(node, operator) ? node.children : [])),
  ].filter((node) => !isLogical(node, operator));
}

function operandsOf(
  chain: TSESTree.LogicalExpression,
  sourceCode: Pick<SourceCode, 'getText'>,
  booleanContext: boolean,
): Operand[] {
  return sourceOperands(chain).flatMap((node) => {
    const term = normalTerm(node, sourceCode, booleanContext);
    if (!isLogical(term, chain.operator)) {
      return [{ term, key: key(term), text: sourceCode.getText(node) }];
    }
    return termOperands(term, chain.operator).map((part) => ({
      term: part,
      key: key(part),
      text: print(part),
    }));
  });
}

function segments(operands: readonly Operand[]): Operand[][] {
  const runs: Operand[][] = [[]];
  for (const operand of operands) {
    runs.at(-1)?.push(operand);
    if (!isEffectFree(operand.term)) {
      runs.push([]);
    }
  }
  return runs;
}

function repeated(operator: string, run: readonly Operand[]): Slip[] {
  const seen = new Set<string>();
  const found: Slip[] = [];
  for (const operand of run.filter(({ term }) => isStable(term))) {
    if (seen.has(operand.key)) {
      found.push({ messageId: 'repeatedOperand', data: { operand: operand.text, operator } });
    }
    seen.add(operand.key);
  }
  return found;
}

function verdictReport(operator: string, verdict: Verdict<Compared>): Slip {
  if (verdict.verdict === 'impossible' || verdict.verdict === 'always') {
    return { messageId: verdict.verdict, data: { operator } };
  }
  const data = { redundant: verdict.redundant.text, deciding: verdict.deciding.text };
  return { messageId: verdict.verdict, data };
}

function comparisonPairs(operator: string, run: readonly Operand[]): Slip[] {
  const comparisons = run.flatMap((operand): Compared[] => {
    const comparison = constantComparison(operand.term);
    return comparison === undefined ? [] : [{ ...comparison, ...operand }];
  });
  return comparisons.flatMap((first, index) =>
    comparisons
      .slice(index + 1)
      .filter((second) => second.key !== first.key)
      .flatMap((second) => {
        const verdict = comparisonVerdict(operator, first, second);
        return verdict === undefined ? [] : [verdictReport(operator, verdict)];
      }),
  );
}

function reportKey({ messageId, data }: Slip): string {
  return messageId === 'impossible' || messageId === 'always'
    ? messageId
    : `${messageId} ${JSON.stringify(data)}`;
}

function distinct(reports: readonly Slip[]): Slip[] {
  return [...new Map(reports.map((report) => [reportKey(report), report])).values()];
}

/**
 * The repeated operands and contradicting or redundant comparisons of the `&&`/`||` chain whose
 * outermost expression is `chain`, one report per problem.
 */
export function chainSlips(
  chain: TSESTree.LogicalExpression,
  sourceCode: Pick<SourceCode, 'getText'>,
  booleanContext: boolean,
): Slip[] {
  const operator = chain.operator;
  const reports = segments(operandsOf(chain, sourceCode, booleanContext)).flatMap((run) => [
    ...repeated(operator, run),
    ...comparisonPairs(operator, run),
  ]);
  return distinct(reports);
}
