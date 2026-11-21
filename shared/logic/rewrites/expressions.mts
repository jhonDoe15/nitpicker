import { cannotThrow } from '../purity.mts';
import {
  flippedEquality as flipped,
  isBooleanLiteral,
  isEquality,
  isBooleanValued,
  isLogical,
  isNot,
  literal,
  logical,
  not,
  term,
  withRange,
} from '../terms.mts';
import { pairOf, tripleOf } from '../typed/term-parts.mts';
import type { ExpressionRewrite, RewriteContext, Term } from '../typed/term-types.mts';

const FALSE = 'false';

function truthinessKept(operand: Term, context: RewriteContext): boolean {
  return context.booleanContext || isBooleanValued(operand);
}

function doubleNegation(node: Term, context: RewriteContext): Term | undefined {
  const inner = node.children[0];
  if (!isNot(node) || inner === undefined || !isNot(inner)) {
    return undefined;
  }
  const operand = inner.children[0];
  return operand !== undefined && truthinessKept(operand, context)
    ? withRange(operand, node.range)
    : undefined;
}

function deMorgan(node: Term): Term | undefined {
  const operand = isNot(node) ? node.children[0] : undefined;
  if (operand === undefined || !(isLogical(operand, '&&') || isLogical(operand, '||'))) {
    return undefined;
  }
  const operands = pairOf(operand);
  if (operands === undefined) {
    return undefined;
  }
  const [left, right] = operands;
  return logical(operand.value === '&&' ? '||' : '&&', [not(left), not(right)], node.range);
}

function flippedEquality(node: Term): Term | undefined {
  const operand = isNot(node) ? node.children[0] : undefined;
  return operand !== undefined && isEquality(operand)
    ? withRange(term('binary', flipped(operand.value), operand.children), node.range)
    : undefined;
}

function negatedBooleanLiteral(node: Term): Term | undefined {
  const operand = isNot(node) ? node.children[0] : undefined;
  return operand !== undefined && isBooleanLiteral(operand)
    ? literal(operand.value === 'true' ? FALSE : 'true', node.range)
    : undefined;
}

function constantOperands(node: Term, context: RewriteContext): Term | undefined {
  if (!(isLogical(node, '&&') || isLogical(node, '||'))) {
    return undefined;
  }
  const operands = pairOf(node);
  if (operands === undefined) {
    return undefined;
  }
  const [left, right] = operands;
  const absorbing = node.value === '&&' ? FALSE : 'true';
  if (isBooleanLiteral(left)) {
    return withRange(left.value === absorbing ? left : right, node.range);
  }
  if (!(isBooleanLiteral(right) && truthinessKept(left, context))) {
    return undefined;
  }
  if (right.value !== absorbing) {
    return withRange(left, node.range);
  }
  return cannotThrow(left) ? withRange(right, node.range) : undefined;
}

type TernaryParts = {
  readonly test: Term;
  readonly consequent: Term;
  readonly alternate: Term;
  readonly range: Term['range'];
};

function keptTestTernary({ test, consequent, alternate, range }: TernaryParts): Term | undefined {
  if (isBooleanLiteral(consequent, 'true')) {
    return logical('||', [test, alternate], range);
  }
  return isBooleanLiteral(alternate, FALSE) ? logical('&&', [test, consequent], range) : undefined;
}

function booleanTernary(node: Term, context: RewriteContext): Term | undefined {
  const parts = tripleOf(node);
  if (node.kind !== 'conditional' || parts === undefined) {
    return undefined;
  }
  const [test, consequent, alternate] = parts;
  const testKept = truthinessKept(test, context);
  if (isBooleanLiteral(consequent, 'true') && isBooleanLiteral(alternate, FALSE)) {
    return testKept ? withRange(test, node.range) : not(not(test), node.range);
  }
  if (isBooleanLiteral(consequent, FALSE)) {
    return isBooleanLiteral(alternate, 'true')
      ? not(test, node.range)
      : logical('&&', [not(test), alternate], node.range);
  }
  if (isBooleanLiteral(alternate, 'true')) {
    return logical('||', [not(test), consequent], node.range);
  }
  return testKept ? keptTestTernary({ test, consequent, alternate, range: node.range }) : undefined;
}

function negatedTernary(node: Term): Term | undefined {
  const parts = tripleOf(node);
  if (node.kind !== 'conditional' || parts === undefined || !isNot(node.children[0])) {
    return undefined;
  }
  const [test, consequent, alternate] = parts;
  const negated = test.children[0];
  return negated === undefined
    ? undefined
    : withRange(term('conditional', undefined, [negated, alternate, consequent]), node.range);
}

export const EXPRESSION_REWRITES: readonly ExpressionRewrite[] = [
  { name: 'double-negation', rewrite: doubleNegation },
  { name: 'de-morgan', rewrite: deMorgan },
  { name: 'flipped-equality', rewrite: flippedEquality },
  { name: 'negated-boolean-literal', rewrite: negatedBooleanLiteral },
  { name: 'constant-boolean-operand', rewrite: constantOperands },
  { name: 'boolean-literal-ternary', rewrite: booleanTernary },
  { name: 'negated-condition', rewrite: negatedTernary },
];
