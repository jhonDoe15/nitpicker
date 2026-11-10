import { print } from '../../../../../../shared/logic/print.mjs';
import { isLogical, key } from '../../../../../../shared/logic/terms.mjs';
import { chainOf, depthFirst } from '../../../../../../shared/traversal.mjs';
import { comparisonVerdict, constantComparison } from './constant-comparisons.mjs';
import { isEffectFree, isStable, normalTerm } from './operand-terms.mjs';

const TRANSPARENT = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

function inner(node) {
  return chainOf(node, (current) =>
    TRANSPARENT.has(current.type) ? current.expression : undefined,
  ).at(-1);
}

function isSameChain(node, operator) {
  return node.type === 'LogicalExpression' && node.operator === operator;
}

function sourceOperands(chain) {
  const operator = chain.operator;
  return [
    ...depthFirst(chain, (node) => {
      const current = inner(node);
      return isSameChain(current, operator) ? [current.left, current.right] : [];
    }),
  ].filter((node) => !isSameChain(inner(node), operator));
}

function termOperands(term, operator) {
  return [...depthFirst(term, (node) => (isLogical(node, operator) ? node.children : []))].filter(
    (node) => !isLogical(node, operator),
  );
}

function operandsOf(chain, sourceCode, booleanContext) {
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

function segments(operands) {
  const runs = [[]];
  for (const operand of operands) {
    runs.at(-1).push(operand);
    if (!isEffectFree(operand.term)) {
      runs.push([]);
    }
  }
  return runs;
}

function repeated(operator, run) {
  const seen = new Set();
  const found = [];
  for (const operand of run.filter(({ term }) => isStable(term))) {
    if (seen.has(operand.key)) {
      found.push({ messageId: 'repeatedOperand', data: { operand: operand.text, operator } });
    }
    seen.add(operand.key);
  }
  return found;
}

function verdictReport(operator, verdict) {
  if (verdict.verdict === 'impossible' || verdict.verdict === 'always') {
    return { messageId: verdict.verdict, data: { operator } };
  }
  const data = { redundant: verdict.redundant.text, deciding: verdict.deciding.text };
  return { messageId: verdict.verdict, data };
}

function comparisonPairs(operator, run) {
  const comparisons = run
    .map((operand) => ({ operand, comparison: constantComparison(operand.term) }))
    .filter(({ comparison }) => comparison !== undefined)
    .map(({ operand, comparison }) => ({ ...comparison, ...operand }));
  return comparisons.flatMap((first, index) =>
    comparisons
      .slice(index + 1)
      .filter((second) => second.key !== first.key)
      .map((second) => comparisonVerdict(operator, first, second))
      .filter((verdict) => verdict !== undefined)
      .map((verdict) => verdictReport(operator, verdict)),
  );
}

function reportKey({ messageId, data }) {
  return messageId === 'impossible' || messageId === 'always'
    ? messageId
    : `${messageId} ${JSON.stringify(data)}`;
}

function distinct(reports) {
  return [...new Map(reports.map((report) => [reportKey(report), report])).values()];
}

/**
 * The repeated operands and contradicting or redundant comparisons of the `&&`/`||` chain whose
 * outermost expression is `chain`, one report per problem.
 */
export function chainSlips(chain, sourceCode, booleanContext) {
  const operator = chain.operator;
  const reports = segments(operandsOf(chain, sourceCode, booleanContext)).flatMap((run) => [
    ...repeated(operator, run),
    ...comparisonPairs(operator, run),
  ]);
  return distinct(reports);
}
