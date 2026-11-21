import { required } from '../typed/term-parts.mts';
import type { Encoded, Encoding, Vector, Z3Bool, Z3Vector } from '../typed/solver-types.mts';
import type { Term } from '../typed/term-types.mts';

type SizedTerm = Term & { readonly bits: number };
type Child = Pick<Encoded, 'vector' | 'truth'>;
type ArithmeticMethod = 'add' | 'sub' | 'mul' | 'sdiv' | 'srem' | 'and' | 'or' | 'xor';
type ShiftMethod = 'shl' | 'shr' | 'lshr';
type UnsignedDivision = 'udiv' | 'urem';
type Compare = 'slt' | 'sle' | 'sgt' | 'sge' | 'ult' | 'ule' | 'ugt' | 'uge';

const MULTIPLICATIVE = new Map<string | undefined, ArithmeticMethod>([
  ['+', 'add'],
  ['-', 'sub'],
  ['*', 'mul'],
  ['/', 'sdiv'],
  ['%', 'srem'],
  ['&', 'and'],
  ['|', 'or'],
  ['^', 'xor'],
]);
const SHIFTS = new Map<string | undefined, ShiftMethod>([
  ['<<', 'shl'],
  ['>>', 'shr'],
  ['>>>', 'lshr'],
]);
const COMPARES = new Map<string, Compare>([
  ['<', 'slt'],
  ['<=', 'sle'],
  ['>', 'sgt'],
  ['>=', 'sge'],
]);
const UNSIGNED_COMPARES = new Map<string, Compare>([
  ['<', 'ult'],
  ['<=', 'ule'],
  ['>', 'ugt'],
  ['>=', 'uge'],
]);
const UNSIGNED_DIVISIONS = new Map<string | undefined, UnsignedDivision>([
  ['/', 'udiv'],
  ['%', 'urem'],
]);
const MIN_COMPARED_BITS = 32;

function isVectorNode(node: Term): node is SizedTerm {
  return node.bits !== undefined;
}

function literalBits(node: SizedTerm): bigint {
  return BigInt.asIntN(node.bits, BigInt(required(node.value, 'literal value')));
}

function resized(vector: Vector, bits: number): Z3Vector {
  if (vector.bits === bits) {
    return vector.expr;
  }
  if (vector.bits > bits) {
    return vector.expr.extract(bits - 1, 0);
  }
  const grow = bits - vector.bits;
  return vector.signed ? vector.expr.signExt(grow) : vector.expr.zeroExt(grow);
}

function shiftCount(right: Vector, bits: number): Z3Vector {
  const count = resized(right, bits);
  return count.and(count.ctx.BitVec.val(bits - 1, bits));
}

function arithmetic(
  encoding: Encoding,
  node: SizedTerm,
  [left, right]: [Vector, Vector],
): Z3Vector {
  const { bits } = node;
  const first = resized(left, bits);
  const shift = SHIFTS.get(node.value);
  if (shift !== undefined) {
    return first[shift](shiftCount(right, bits));
  }
  const second = resized(right, bits);
  if (node.value === '/' || node.value === '%') {
    encoding.divisors.push(second);
  }
  const method = node.signed ? undefined : UNSIGNED_DIVISIONS.get(node.value);
  const named = required(method ?? MULTIPLICATIVE.get(node.value), 'arithmetic operator');
  return first[named](second);
}

function unary(node: SizedTerm, [operand]: [Vector]): Z3Vector {
  const value = resized(operand, node.bits);
  if (node.value === '-') {
    return value.neg();
  }
  return node.value === '~' ? value.not() : value;
}

function operation(encoding: Encoding, node: SizedTerm, operands: Vector[]): Z3Vector {
  const { z3 } = encoding;
  const [first, second] = operands;
  if (node.kind === 'binary') {
    return arithmetic(encoding, node, [
      required(first, 'left operand'),
      required(second, 'right operand'),
    ]);
  }
  if (node.kind === 'unary') {
    return unary(node, [required(first, 'operand')]);
  }
  const value = resized(required(first, 'operand'), node.bits);
  if (node.kind === 'cast') {
    return value;
  }
  return z3.If(value.slt(z3.BitVec.val(0, node.bits)), value.neg(), value);
}

function conditional(encoding: Encoding, node: SizedTerm, children: Child[]): Z3Vector | undefined {
  const [condition, whenTrue, whenFalse] = children;
  const { vector: trueVector } = required(whenTrue, 'consequent');
  const { vector: falseVector } = required(whenFalse, 'alternate');
  return trueVector !== undefined && falseVector !== undefined
    ? encoding.z3.If(
        required(condition, 'condition').truth,
        resized(trueVector, node.bits),
        resized(falseVector, node.bits),
      )
    : undefined;
}

const OPERATIONS = new Set<string>(['binary', 'unary', 'cast', 'abs']);

function exprOf(
  encoding: Encoding,
  node: SizedTerm,
  { children, atom }: { readonly children: Child[]; readonly atom: () => Z3Vector },
): Z3Vector | undefined {
  if (node.kind === 'conditional') {
    return conditional(encoding, node, children);
  }
  if (node.kind === 'literal') {
    return encoding.z3.BitVec.val(literalBits(node), node.bits);
  }
  if (!OPERATIONS.has(node.kind)) {
    return atom();
  }
  const operands = children.flatMap((child) => (child.vector === undefined ? [] : [child.vector]));
  return operands.length === children.length ? operation(encoding, node, operands) : undefined;
}

export function vectorOf(
  encoding: Encoding,
  node: Term,
  parts: { readonly children: Child[]; readonly atom: () => Z3Vector },
): Vector | undefined {
  if (!isVectorNode(node)) {
    return undefined;
  }
  const expr = exprOf(encoding, node, parts);
  return expr === undefined ? undefined : { bits: node.bits, signed: node.signed === true, expr };
}

function commonBits(left: Vector, right: Vector): number {
  return Math.max(left.bits, right.bits, MIN_COMPARED_BITS);
}

export function vectorRelation(operator: string, [left, right]: [Vector, Vector]): Z3Bool {
  const bits = commonBits(left, right);
  const compares = left.signed || right.signed ? COMPARES : UNSIGNED_COMPARES;
  return resized(left, bits)[required(compares.get(operator), 'comparison operator')](
    resized(right, bits),
  );
}

export function vectorEquality(left: Vector, right: Vector): Z3Bool {
  const bits = commonBits(left, right);
  return resized(left, bits).eq(resized(right, bits));
}
