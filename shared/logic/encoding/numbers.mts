import { boundedModelOf } from '../models/models.mts';
import type { Term } from '../typed/term-types.mts';

const INTEGER = /^-?\d+$/u;
const DECIMAL = /^-?\d+(?:\.\d+)?$/u;
const ARITHMETIC = new Set<string | undefined>(['+', '-', '*']);

function isIntegerLiteral(node: Term): boolean {
  return (
    node.kind === 'literal' &&
    node.value !== undefined &&
    INTEGER.test(node.value) &&
    Number.isSafeInteger(Number.parseInt(node.value, 10))
  );
}

export function isExactNumber(node: Term): boolean {
  return (
    node.value !== undefined &&
    DECIMAL.test(node.value) &&
    (!INTEGER.test(node.value) || isIntegerLiteral(node))
  );
}

export function isArithmeticOperator(node: Term): boolean {
  return (
    (node.kind === 'unary' && node.value === '-') ||
    (node.kind === 'binary' && ARITHMETIC.has(node.value))
  );
}

export function isIntegral(
  node: Term,
  children: readonly { readonly integral: boolean }[],
): boolean {
  if (
    isIntegerLiteral(node) ||
    node.integer === true ||
    node.bits !== undefined ||
    boundedModelOf(node)?.integer === true
  ) {
    return true;
  }
  if (node.kind === 'conditional') {
    return children[1]?.integral === true && children[2]?.integral === true;
  }
  return isArithmeticOperator(node) && children.every((child) => child.integral);
}
