import { vectorOf, vectorEquality, vectorRelation } from './bitvectors/encode.mjs';
import { vectorBounds, vectorNumber } from './bitvectors/values.mjs';
import { counterexampleOf } from './encoding/explain.mjs';
import { isArithmeticOperator, isExactNumber, isIntegral } from './encoding/numbers.mjs';
import { boundFacts, boundedModelOf } from './models/models.mjs';
import { isSideEffectFree } from './purity.mjs';
import { foldTerm, isBooleanLiteral, isComparison, isLogical, isNot, key } from './terms.mjs';

const DEFAULT_RESOURCE_LIMIT = 2_000_000;

const STRICT_EQUALITY = new Set(['===', '!==']);

const solverContext = loadOnce(async () => {
  const { init } = await import('z3-solver');
  const { Context } = await init();
  return Context('nitpicker-logic');
});

function loadOnce(load) {
  const loaded = [];
  return () => {
    if (loaded.length === 0) {
      loaded.push(load());
    }
    return loaded[0];
  };
}

function memo(map, name, create) {
  if (!map.has(name)) {
    map.set(name, create(map.size));
  }
  return map.get(name);
}

function isStable(encoding, node) {
  if (node.kind === 'opaque') {
    return false;
  }
  return encoding.sameCalls || isSideEffectFree(node);
}

function atom(encoding, sort, node) {
  const { z3 } = encoding;
  const identity = isStable(encoding, node)
    ? key(node)
    : `occurrence ${String(encoding.atoms.size)}`;
  return memo(encoding.atoms, `${sort}:${identity}`, (index) => {
    const name = `a${String(index)}`;
    if (sort !== 'value') {
      return z3.Bool.const(name);
    }
    return node.bits === undefined
      ? encoding.numbers.const(name)
      : z3.BitVec.const(name, node.bits);
  });
}

function vectorAtom(encoding, node) {
  const constant = atom(encoding, 'value', node);
  if (!node.signed) {
    encoding.unsigned.add(constant);
  }
  return constant;
}

function literalValue(encoding, node) {
  if (isExactNumber(node)) {
    return memo(encoding.literals, node.value, () => encoding.numbers.val(node.value));
  }
  return memo(encoding.literals, node.value, (index) =>
    encoding.numbers.const(`c${String(index)}`),
  );
}

function arithmeticValue(node, [left, right]) {
  if (node.kind === 'unary') {
    return left.value.neg();
  }
  if (node.value === '+') {
    return left.value.add(right.value);
  }
  return node.value === '-' ? left.value.sub(right.value) : left.value.mul(right.value);
}

function encodeValue(encoding, { node, children, integral }) {
  if (node.kind === 'literal') {
    return literalValue(encoding, node);
  }
  if (integral && isArithmeticOperator(node)) {
    return arithmeticValue(node, children);
  }
  if (integral && node.kind === 'conditional') {
    const [condition, whenTrue, whenFalse] = children;
    return encoding.z3.If(condition.truth, whenTrue.value, whenFalse.value);
  }
  const value = atom(encoding, 'value', node);
  if (integral && !encoding.integers) {
    encoding.facts.push(encoding.z3.IsInt(value));
  }
  return value;
}

function encodeNotANumber(encoding, { node, integral }) {
  return node.kind === 'literal' || integral || encoding.integers || boundedModelOf(node)?.number
    ? encoding.z3.Bool.val(false)
    : atom(encoding, 'not-a-number', node);
}

function isNumber(operand) {
  return operand.node.kind !== 'literal' || isExactNumber(operand.node);
}

function numeric(encoding, [left, right], relation) {
  const { z3 } = encoding;
  return z3.And(z3.Not(left.notANumber), z3.Not(right.notANumber), relation);
}

function comparison(encoding, node, children) {
  const [left, right] = children;
  if (left.vector !== undefined && right.vector !== undefined) {
    return vectorRelation(node.value, [left.vector, right.vector]);
  }
  if (!children.every(isNumber)) {
    return atom(encoding, 'truth', node);
  }
  const compare = { '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' }[node.value];
  return numeric(encoding, children, left.value[compare](right.value));
}

function connective(z3, node, [first, second, third]) {
  if (isNot(node)) {
    return z3.Not(first.truth);
  }
  if (isLogical(node, '&&')) {
    return z3.And(first.truth, second.truth);
  }
  if (isLogical(node, '||')) {
    return z3.Or(first.truth, second.truth);
  }
  return node.kind === 'conditional' ? z3.If(first.truth, second.truth, third.truth) : undefined;
}

function relation(encoding, node, children) {
  if (isComparison(node)) {
    return comparison(encoding, node, children);
  }
  if (node.kind !== 'binary' || !STRICT_EQUALITY.has(node.value)) {
    return undefined;
  }
  const [left, right] = children;
  const bothVectors = left.vector !== undefined && right.vector !== undefined;
  const equal = bothVectors
    ? vectorEquality(left.vector, right.vector)
    : numeric(encoding, children, left.value.eq(right.value));
  return node.value === '===' ? equal : encoding.z3.Not(equal);
}

function encodeTruth(encoding, { node, children }) {
  if (isBooleanLiteral(node)) {
    return encoding.z3.Bool.val(node.value === 'true');
  }
  return (
    connective(encoding.z3, node, children) ??
    relation(encoding, node, children) ??
    atom(encoding, 'truth', node)
  );
}

function encode(encoding, root) {
  return foldTerm(root, (node, children) => {
    const encoded = { node, children, integral: isIntegral(node, children) };
    const vector = vectorOf(encoding, node, { children, atom: () => vectorAtom(encoding, node) });
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

function assumeModel(encoding, { node, vector, value, notANumber }) {
  const model = boundedModelOf(node);
  if (model !== undefined) {
    const { z3, numbers } = encoding;
    const bounds = vector === undefined ? { value, numbers } : vectorBounds(z3, vector);
    encoding.facts.push(...boundFacts(z3, { model, notANumber, ...bounds }));
  }
}

function distinctLiterals(encoding) {
  const literals = [...encoding.literals.values()];
  return literals.length > 1 ? [encoding.z3.Distinct(...literals)] : [];
}

function solverOf(z3, assertions, resourceLimit) {
  const solver = new z3.Solver();
  solver.set('rlimit', resourceLimit);
  solver.add(...assertions);
  return solver;
}

function satisfiable(z3, assertions, resourceLimit) {
  return solverOf(z3, assertions, resourceLimit).check();
}

async function encoded(
  conditions,
  query,
  { sameCalls = false, integers = false, nonZeroDivisors = false },
) {
  const z3 = await solverContext();
  const numbers = integers ? z3.Int : z3.Real;
  const encoding = {
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

export async function decide(conditions, query, options = {}) {
  const { resourceLimit = DEFAULT_RESOURCE_LIMIT } = options;
  const { z3, facts, asked } = await encoded(conditions, query, options);
  const canHold = await satisfiable(z3, [...facts, asked], resourceLimit);
  const canFail = await satisfiable(z3, [...facts, z3.Not(asked)], resourceLimit);
  if (canHold === 'unsat' && canFail === 'unsat') {
    return 'unreachable';
  }
  if (canFail === 'unsat') {
    return 'true';
  }
  return canHold === 'unsat' ? 'false' : 'open';
}

export async function counterexample(conditions, query, options = {}) {
  const { resourceLimit = DEFAULT_RESOURCE_LIMIT } = options;
  const { z3, encoding, facts, asked } = await encoded(conditions, query, options);
  const solver = solverOf(z3, [...facts, z3.Not(asked)], resourceLimit);
  if ((await solver.check()) !== 'sat') {
    return undefined;
  }
  return counterexampleOf(encoding, solver.model());
}
