import { vectorOf, vectorEquality, vectorRelation } from './bitvectors/encode.mts';
import { vectorBounds, vectorNumber } from './bitvectors/values.mts';
import { counterexampleOf } from './encoding/explain.mts';
import { boolAtom, literalValue, numberAtom, vectorAtom } from './encoding/atoms.mts';
import { isArithmeticOperator, isExactNumber, isIntegral } from './encoding/numbers.mts';
import { solverContext } from './encoding/solver-context.mts';
import { boundFacts, boundedModelOf } from './models/models.mts';
import { foldTerm, isBooleanLiteral, isComparison, isLogical, isNot } from './terms.mts';
import { required } from './typed/term-parts.mts';
import type {
  DecideOptions,
  Encoded,
  Encoding,
  Z3,
  Z3Arith,
  Z3Bool,
  Z3Solver,
  Z3Vector,
  Vector,
} from './typed/solver-types.mts';
import type { Term, Verdict } from './typed/term-types.mts';
import type { CheckSatResult } from 'z3-solver';

type Parts = {
  readonly node: Term;
  readonly children: Encoded[];
  readonly integral: boolean;
};
type CompareMethod = 'lt' | 'le' | 'gt' | 'ge';

const LEFT_OPERAND = 'left operand';
const RIGHT_OPERAND = 'right operand';
const UNSAT = 'unsat';

const DEFAULT_RESOURCE_LIMIT = 2_000_000;

const STRICT_EQUALITY = new Set<string | undefined>(['===', '!==']);
const COMPARISONS = new Map<string | undefined, CompareMethod>([
  ['<', 'lt'],
  ['<=', 'le'],
  ['>', 'gt'],
  ['>=', 'ge'],
]);

function signedAtom(encoding: Encoding, node: Term): Z3Vector {
  const constant = vectorAtom(encoding, node);
  if (!node.signed) {
    encoding.unsigned.add(constant);
  }
  return constant;
}

function arithmeticValue(node: Term, children: Encoded[]): Z3Arith {
  const left = required(children[0], LEFT_OPERAND);
  if (node.kind === 'unary') {
    return left.value.neg();
  }
  const right = required(children[1], RIGHT_OPERAND);
  if (node.value === '+') {
    return left.value.add(right.value);
  }
  return node.value === '-' ? left.value.sub(right.value) : left.value.mul(right.value);
}

function encodeValue(encoding: Encoding, { node, children, integral }: Parts): Z3Arith {
  if (node.kind === 'literal') {
    return literalValue(encoding, node);
  }
  if (integral && isArithmeticOperator(node)) {
    return arithmeticValue(node, children);
  }
  if (integral && node.kind === 'conditional') {
    const [condition, whenTrue, whenFalse] = children;
    return encoding.z3.If(
      required(condition, 'condition').truth,
      required(whenTrue, 'consequent').value,
      required(whenFalse, 'alternate').value,
    );
  }
  const value = numberAtom(encoding, node);
  if (integral && !encoding.integers) {
    encoding.facts.push(encoding.z3.IsInt(value));
  }
  return value;
}

function encodeNotANumber(encoding: Encoding, { node, integral }: Parts): Z3Bool {
  return node.kind === 'literal' ||
    integral ||
    encoding.integers ||
    boundedModelOf(node)?.number === true
    ? encoding.z3.Bool.val(false)
    : boolAtom(encoding, 'not-a-number', node);
}

function isNumber(operand: Encoded): boolean {
  return operand.node.kind !== 'literal' || isExactNumber(operand.node);
}

function numeric(encoding: Encoding, children: Encoded[], relation: Z3Bool): Z3Bool {
  const { z3 } = encoding;
  const [left, right] = children;
  return z3.And(
    z3.Not(required(left, LEFT_OPERAND).notANumber),
    z3.Not(required(right, RIGHT_OPERAND).notANumber),
    relation,
  );
}

function comparison(encoding: Encoding, node: Term, children: Encoded[]): Z3Bool {
  const left = required(children[0], LEFT_OPERAND);
  const right = required(children[1], RIGHT_OPERAND);
  if (left.vector !== undefined && right.vector !== undefined) {
    return vectorRelation(required(node.value, 'operator'), [left.vector, right.vector]);
  }
  if (!children.every(isNumber)) {
    return boolAtom(encoding, 'truth', node);
  }
  const compare = required(COMPARISONS.get(node.value), 'comparison operator');
  return numeric(encoding, children, left.value[compare](right.value));
}

function connective(z3: Z3, node: Term, children: Encoded[]): Z3Bool | undefined {
  const [first, second, third] = children;
  if (isNot(node)) {
    return z3.Not(required(first, 'operand').truth);
  }
  if (isLogical(node, '&&')) {
    return z3.And(required(first, LEFT_OPERAND).truth, required(second, RIGHT_OPERAND).truth);
  }
  if (isLogical(node, '||')) {
    return z3.Or(required(first, LEFT_OPERAND).truth, required(second, RIGHT_OPERAND).truth);
  }
  return node.kind === 'conditional'
    ? z3.If(
        required(first, 'condition').truth,
        required(second, 'consequent').truth,
        required(third, 'alternate').truth,
      )
    : undefined;
}

function relation(encoding: Encoding, node: Term, children: Encoded[]): Z3Bool | undefined {
  if (isComparison(node)) {
    return comparison(encoding, node, children);
  }
  if (node.kind !== 'binary' || !STRICT_EQUALITY.has(node.value)) {
    return undefined;
  }
  const left = required(children[0], LEFT_OPERAND);
  const right = required(children[1], RIGHT_OPERAND);
  const equal =
    left.vector !== undefined && right.vector !== undefined
      ? vectorEquality(left.vector, right.vector)
      : numeric(encoding, children, left.value.eq(right.value));
  return node.value === '===' ? equal : encoding.z3.Not(equal);
}

function encodeTruth(encoding: Encoding, { node, children }: Parts): Z3Bool {
  if (isBooleanLiteral(node)) {
    return encoding.z3.Bool.val(node.value === 'true');
  }
  return (
    connective(encoding.z3, node, children) ??
    relation(encoding, node, children) ??
    boolAtom(encoding, 'truth', node)
  );
}

function encode(encoding: Encoding, root: Term): Z3Bool {
  return foldTerm<Encoded>(root, (node, children) => {
    const encoded: Parts = { node, children, integral: isIntegral(node, children) };
    const vector = vectorOf(encoding, node, { children, atom: () => signedAtom(encoding, node) });
    const value =
      vector === undefined ? encodeValue(encoding, encoded) : vectorNumber(encoding, vector);
    const notANumber =
      vector === undefined ? encodeNotANumber(encoding, encoded) : encoding.z3.Bool.val(false);
    assumeModel(encoding, { node, vector, value, notANumber });
    return {
      node,
      integral: encoded.integral,
      vector,
      value,
      notANumber,
      truth: encodeTruth(encoding, encoded),
    };
  }).truth;
}

function assumeModel(
  encoding: Encoding,
  {
    node,
    vector,
    value,
    notANumber,
  }: {
    readonly node: Term;
    readonly vector: Vector | undefined;
    readonly value: Z3Arith;
    readonly notANumber: Z3Bool;
  },
): void {
  const model = boundedModelOf(node);
  if (model !== undefined) {
    const { z3, numbers } = encoding;
    const facts =
      vector === undefined
        ? boundFacts(z3, { model, notANumber, value, numbers })
        : boundFacts(z3, { model, notANumber, ...vectorBounds(z3, vector) });
    for (const fact of facts) {
      encoding.facts.push(fact);
    }
  }
}

function distinctLiterals(encoding: Encoding): Z3Bool[] {
  const literals = [...encoding.literals.values()];
  return literals.length > 1 ? [encoding.z3.Distinct(...literals)] : [];
}

function solverOf(z3: Z3, assertions: readonly Z3Bool[], resourceLimit: number): Z3Solver {
  const solver = new z3.Solver();
  solver.set('rlimit', resourceLimit);
  solver.add(...assertions);
  return solver;
}

function satisfiable(
  z3: Z3,
  assertions: readonly Z3Bool[],
  resourceLimit: number,
): Promise<CheckSatResult> {
  return solverOf(z3, assertions, resourceLimit).check();
}

async function encoded(
  conditions: readonly Term[],
  query: Term,
  { sameCalls = false, integers = false, nonZeroDivisors = false }: DecideOptions,
): Promise<{ z3: Z3; encoding: Encoding; facts: Z3Bool[]; asked: Z3Bool }> {
  const z3 = await solverContext();
  const numbers = integers ? z3.Int : z3.Real;
  const encoding: Encoding = {
    z3,
    sameCalls,
    integers,
    numbers,
    atoms: new Map(),
    literals: new Map(),
    unsigned: new Set(),
    divisors: [],
    facts: [],
  };
  const path = conditions.map((condition) => encode(encoding, condition));
  const asked = encode(encoding, query);
  const divisors = nonZeroDivisors
    ? encoding.divisors.map((divisor) => divisor.neq(z3.BitVec.val(0, divisor.size())))
    : [];
  const facts = [...distinctLiterals(encoding), ...encoding.facts, ...divisors, ...path];
  return { z3, encoding, facts, asked };
}

export async function decide(
  conditions: readonly Term[],
  query: Term,
  options: DecideOptions = {},
): Promise<Verdict> {
  const { resourceLimit = DEFAULT_RESOURCE_LIMIT } = options;
  const { z3, facts, asked } = await encoded(conditions, query, options);
  const canHold = await satisfiable(z3, [...facts, asked], resourceLimit);
  const canFail = await satisfiable(z3, [...facts, z3.Not(asked)], resourceLimit);
  if (canHold === UNSAT && canFail === UNSAT) {
    return 'unreachable';
  }
  if (canFail === UNSAT) {
    return 'true';
  }
  return canHold === UNSAT ? 'false' : 'open';
}

export async function counterexample(
  conditions: readonly Term[],
  query: Term,
  options: DecideOptions = {},
): Promise<string | undefined> {
  const { resourceLimit = DEFAULT_RESOURCE_LIMIT } = options;
  const { z3, encoding, facts, asked } = await encoded(conditions, query, options);
  const solver = solverOf(z3, [...facts, z3.Not(asked)], resourceLimit);
  if ((await solver.check()) !== 'sat') {
    return undefined;
  }
  return counterexampleOf(encoding, solver.model());
}
