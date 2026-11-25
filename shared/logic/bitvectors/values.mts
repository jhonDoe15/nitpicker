import { foldTerm } from '../terms.mts';
import type {
  BoundSpace,
  Encoding,
  Vector,
  Z3,
  Z3Arith,
  Z3Vector,
} from '../typed/solver-types.mts';
import type { Term } from '../typed/term-types.mts';

const OPERATIONS = new Set<string>(['binary', 'unary', 'cast', 'abs']);

export function vectorNumber(encoding: Pick<Encoding, 'z3' | 'numbers'>, vector: Vector): Z3Arith {
  const whole = encoding.z3.BV2Int(vector.expr, vector.signed);
  return encoding.numbers === encoding.z3.Int ? whole : encoding.z3.ToReal(whole);
}

export function vectorBounds(z3: Z3, vector: Vector): BoundSpace<Z3Vector> {
  return {
    value: { ge: (bound) => vector.expr.sge(bound), lt: (bound) => vector.expr.slt(bound) },
    numbers: { val: (number) => z3.BitVec.val(number, vector.bits) },
  };
}

export function hasVectorOperations(terms: readonly Term[]): boolean {
  return terms.some((root) =>
    foldTerm<boolean>(
      root,
      (node, children) =>
        (node.bits !== undefined && OPERATIONS.has(node.kind)) || children.some(Boolean),
    ),
  );
}

const EXACT_OPERATORS = new Set<string | undefined>(['+', '-', '*']);

export function hasExactArithmetic(terms: readonly Term[]): boolean {
  return terms.some((root) =>
    foldTerm<boolean>(
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
