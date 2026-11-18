import { foldTerm } from '../terms.mjs';

const OPERATIONS = new Set(['binary', 'unary', 'cast', 'abs']);

/** The whole number a vector stands for, as a solver number of the sort `numbers` makes. */
export function vectorNumber(encoding, vector) {
  const whole = encoding.z3.BV2Int(vector.expr, vector.signed);
  return encoding.numbers === encoding.z3.Int ? whole : encoding.z3.ToReal(whole);
}

/** What `value.ge(numbers.val(n))` and `value.lt(...)` mean for a vector. */
export function vectorBounds(z3, vector) {
  return {
    value: { ge: (bound) => vector.expr.sge(bound), lt: (bound) => vector.expr.slt(bound) },
    numbers: { val: (number) => z3.BitVec.val(number, vector.bits) },
  };
}

/** Whether any term in `terms` computes with fixed-width integers, which only the solver decides. */
export function hasVectorOperations(terms) {
  return terms.some((root) =>
    foldTerm(
      root,
      (node, children) =>
        (node.bits !== undefined && OPERATIONS.has(node.kind)) || children.some(Boolean),
    ),
  );
}

const EXACT_OPERATORS = new Set(['+', '-', '*']);

/** Whether any term in `terms` adds, subtracts or multiplies integers exactly, as Python does. */
export function hasExactArithmetic(terms) {
  return terms.some((root) =>
    foldTerm(
      root,
      (node, children) =>
        (node.bits === undefined &&
          (node.kind === 'binary' || node.kind === 'unary') &&
          EXACT_OPERATORS.has(node.value) &&
          node.children.some((child) => child.integer === true)) ||
        children.some(Boolean),
    ),
  );
}
