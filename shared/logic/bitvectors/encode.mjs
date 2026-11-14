const MULTIPLICATIVE = new Map([
  ['+', 'add'],
  ['-', 'sub'],
  ['*', 'mul'],
  ['/', 'sdiv'],
  ['%', 'srem'],
  ['&', 'and'],
  ['|', 'or'],
  ['^', 'xor'],
]);
const SHIFTS = new Map([
  ['<<', 'shl'],
  ['>>', 'shr'],
  ['>>>', 'lshr'],
]);
const COMPARES = { '<': 'slt', '<=': 'sle', '>': 'sgt', '>=': 'sge' };
const MIN_COMPARED_BITS = 32;

function isVectorNode(node) {
  return node.bits !== undefined;
}

function literalBits(node) {
  return BigInt.asIntN(node.bits, BigInt(node.value));
}

/** `vector` at `bits` wide: sign- or zero-extended by its own signedness, or cut to the low bits. */
function resized(vector, bits) {
  if (vector.bits === bits) {
    return vector.expr;
  }
  if (vector.bits > bits) {
    return vector.expr.extract(bits - 1, 0);
  }
  const grow = bits - vector.bits;
  return vector.signed ? vector.expr.signExt(grow) : vector.expr.zeroExt(grow);
}

function shiftCount(right, bits) {
  const count = resized(right, bits);
  return count.and(count.ctx.BitVec.val(bits - 1, bits));
}

function arithmetic(encoding, node, [left, right]) {
  const { bits } = node;
  const first = resized(left, bits);
  if (SHIFTS.has(node.value)) {
    return first[SHIFTS.get(node.value)](shiftCount(right, bits));
  }
  const second = resized(right, bits);
  if (node.value === '/' || node.value === '%') {
    encoding.divisors.push(second);
  }
  return first[MULTIPLICATIVE.get(node.value)](second);
}

function unary(node, [operand]) {
  const value = resized(operand, node.bits);
  if (node.value === '-') {
    return value.neg();
  }
  return node.value === '~' ? value.not() : value;
}

function operation(encoding, node, children) {
  const { z3 } = encoding;
  if (node.kind === 'binary') {
    return arithmetic(encoding, node, children);
  }
  if (node.kind === 'unary') {
    return unary(node, children);
  }
  if (node.kind === 'cast') {
    return resized(children[0], node.bits);
  }
  const value = resized(children[0], node.bits);
  return z3.If(value.slt(z3.BitVec.val(0, node.bits)), value.neg(), value);
}

function conditional(encoding, node, [condition, whenTrue, whenFalse]) {
  const both = whenTrue.vector !== undefined && whenFalse.vector !== undefined;
  return both
    ? encoding.z3.If(
        condition.truth,
        resized(whenTrue.vector, node.bits),
        resized(whenFalse.vector, node.bits),
      )
    : undefined;
}

const OPERATIONS = new Set(['binary', 'unary', 'cast', 'abs']);

function exprOf(encoding, node, { children, atom }) {
  if (node.kind === 'conditional') {
    return conditional(encoding, node, children);
  }
  if (node.kind === 'literal') {
    return encoding.z3.BitVec.val(literalBits(node), node.bits);
  }
  if (!OPERATIONS.has(node.kind)) {
    return atom();
  }
  const operands = children.map((child) => child.vector);
  return operands.every(Boolean) ? operation(encoding, node, operands) : undefined;
}

/**
 * The bit-vector a typed node stands for: `{ expr, bits, signed }`, or undefined when the node has
 * no width or an operand without one. Operands are promoted to the node's width the way Java does,
 * and shift counts are masked to it. `atom` makes the constant of a node that is a free value.
 */
export function vectorOf(encoding, node, parts) {
  if (!isVectorNode(node)) {
    return undefined;
  }
  const expr = exprOf(encoding, node, parts);
  return expr === undefined ? undefined : { bits: node.bits, signed: node.signed, expr };
}

function commonBits(left, right) {
  return Math.max(left.bits, right.bits, MIN_COMPARED_BITS);
}

/** `left op right` over two vectors, both promoted to a common signed width. */
export function vectorRelation(operator, [left, right]) {
  const bits = commonBits(left, right);
  return resized(left, bits)[COMPARES[operator]](resized(right, bits));
}

export function vectorEquality(left, right) {
  const bits = commonBits(left, right);
  return resized(left, bits).eq(resized(right, bits));
}
