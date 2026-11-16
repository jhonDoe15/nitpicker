import { boundedModelOf } from '../models/models.mjs';

const INTEGER = /^-?\d+$/u;
const DECIMAL = /^-?\d+(?:\.\d+)?$/u;
const ARITHMETIC = new Set(['+', '-', '*']);

function isIntegerLiteral(node) {
  return (
    node.kind === 'literal' && INTEGER.test(node.value) && Number.isSafeInteger(Number(node.value))
  );
}

export function isExactNumber(node) {
  return DECIMAL.test(node.value) && (!INTEGER.test(node.value) || isIntegerLiteral(node));
}

export function isArithmeticOperator(node) {
  return (
    (node.kind === 'unary' && node.value === '-') ||
    (node.kind === 'binary' && ARITHMETIC.has(node.value))
  );
}

export function isIntegral(node, children) {
  if (
    isIntegerLiteral(node) ||
    node.integer === true ||
    node.bits !== undefined ||
    boundedModelOf(node)?.integer === true
  ) {
    return true;
  }
  if (node.kind === 'conditional') {
    return children[1].integral && children[2].integral;
  }
  return isArithmeticOperator(node) && children.every((child) => child.integral);
}
