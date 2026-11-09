import { cannotThrow } from '../purity.mjs';
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
} from '../terms.mjs';

function truthinessKept(operand, context) {
  return context.booleanContext || isBooleanValued(operand);
}

function doubleNegation(node, context) {
  if (!isNot(node) || !isNot(node.children[0])) {
    return undefined;
  }
  const operand = node.children[0].children[0];
  return truthinessKept(operand, context) ? withRange(operand, node.range) : undefined;
}

function deMorgan(node) {
  const operand = isNot(node) ? node.children[0] : undefined;
  if (!isLogical(operand, '&&') && !isLogical(operand, '||')) {
    return undefined;
  }
  const [left, right] = operand.children;
  return logical(operand.value === '&&' ? '||' : '&&', [not(left), not(right)], node.range);
}

function flippedEquality(node) {
  const operand = isNot(node) ? node.children[0] : undefined;
  return isEquality(operand)
    ? withRange(term('binary', flipped(operand.value), operand.children), node.range)
    : undefined;
}

function negatedBooleanLiteral(node) {
  const operand = isNot(node) ? node.children[0] : undefined;
  return isBooleanLiteral(operand)
    ? literal(operand.value === 'true' ? 'false' : 'true', node.range)
    : undefined;
}

function constantOperands(node, context) {
  if (!isLogical(node, '&&') && !isLogical(node, '||')) {
    return undefined;
  }
  const [left, right] = node.children;
  const absorbing = node.value === '&&' ? 'false' : 'true';
  if (isBooleanLiteral(left)) {
    return withRange(left.value === absorbing ? left : right, node.range);
  }
  if (!isBooleanLiteral(right) || !truthinessKept(left, context)) {
    return undefined;
  }
  if (right.value !== absorbing) {
    return withRange(left, node.range);
  }
  return cannotThrow(left) ? withRange(right, node.range) : undefined;
}

function booleanTernary(node, context) {
  if (node.kind !== 'conditional') {
    return undefined;
  }
  const [test, consequent, alternate] = node.children;
  const testKept = truthinessKept(test, context);
  if (isBooleanLiteral(consequent, 'true') && isBooleanLiteral(alternate, 'false')) {
    return testKept ? withRange(test, node.range) : not(not(test), node.range);
  }
  if (isBooleanLiteral(consequent, 'false')) {
    return isBooleanLiteral(alternate, 'true')
      ? not(test, node.range)
      : logical('&&', [not(test), alternate], node.range);
  }
  if (isBooleanLiteral(alternate, 'true')) {
    return logical('||', [not(test), consequent], node.range);
  }
  if (!testKept) {
    return undefined;
  }
  if (isBooleanLiteral(consequent, 'true')) {
    return logical('||', [test, alternate], node.range);
  }
  return isBooleanLiteral(alternate, 'false')
    ? logical('&&', [test, consequent], node.range)
    : undefined;
}

function negatedTernary(node) {
  if (node.kind !== 'conditional' || !isNot(node.children[0])) {
    return undefined;
  }
  const [test, consequent, alternate] = node.children;
  return withRange(
    term('conditional', undefined, [test.children[0], alternate, consequent]),
    node.range,
  );
}

export const EXPRESSION_REWRITES = [
  { name: 'double-negation', rewrite: doubleNegation },
  { name: 'de-morgan', rewrite: deMorgan },
  { name: 'flipped-equality', rewrite: flippedEquality },
  { name: 'negated-boolean-literal', rewrite: negatedBooleanLiteral },
  { name: 'constant-boolean-operand', rewrite: constantOperands },
  { name: 'boolean-literal-ternary', rewrite: booleanTernary },
  { name: 'negated-condition', rewrite: negatedTernary },
];
