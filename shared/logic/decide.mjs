import { foldTerm, isBooleanLiteral, isComparison, isLogical, isNot, key } from './terms.mjs';

const DEFAULT_RESOURCE_LIMIT = 2_000_000;

const INTEGER = /^-?\d+$/u;
const ARITHMETIC = new Set(['+', '-', '*']);
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

function isInteger(node) {
  return node.kind === 'literal' && INTEGER.test(node.value);
}

function isArithmeticOperator(node) {
  return (
    (node.kind === 'unary' && node.value === '-') ||
    (node.kind === 'binary' && ARITHMETIC.has(node.value))
  );
}

function memo(map, name, create) {
  if (!map.has(name)) {
    map.set(name, create(map.size));
  }
  return map.get(name);
}

function atom(encoding, sort, node) {
  return memo(encoding.atoms, `${sort}:${key(node)}`, (index) =>
    sort === 'value'
      ? encoding.z3.Int.const(`a${String(index)}`)
      : encoding.z3.Bool.const(`a${String(index)}`),
  );
}

function literalValue(encoding, node) {
  if (isInteger(node)) {
    return memo(encoding.integers, node.value, () => encoding.z3.Int.val(BigInt(node.value)));
  }
  return memo(encoding.constants, node.value, (index) =>
    encoding.z3.Int.const(`c${String(index)}`),
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

function encodeValue(encoding, { node, children, arithmetic }) {
  if (node.kind === 'literal') {
    return literalValue(encoding, node);
  }
  return arithmetic && isArithmeticOperator(node)
    ? arithmeticValue(node, children)
    : atom(encoding, 'value', node);
}

function comparison(encoding, node, [left, right]) {
  if (!left.arithmetic || !right.arithmetic) {
    return atom(encoding, 'truth', node);
  }
  const compare = { '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' }[node.value];
  return left.value[compare](right.value);
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
  const equal = children[0].value.eq(children[1].value);
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

function isArithmetic(node, children) {
  if (node.kind === 'literal') {
    return isInteger(node);
  }
  return !isArithmeticOperator(node) || children.every((child) => child.arithmetic);
}

function encode(encoding, root) {
  return foldTerm(root, (node, children) => {
    const encoded = { node, children, arithmetic: isArithmetic(node, children) };
    return {
      arithmetic: encoded.arithmetic,
      value: encodeValue(encoding, encoded),
      truth: encodeTruth(encoding, encoded),
    };
  }).truth;
}

function distinctLiterals(encoding) {
  const literals = [...encoding.constants.values(), ...encoding.integers.values()];
  return literals.length > 1 ? [encoding.z3.Distinct(...literals)] : [];
}

function satisfiable(z3, assertions, resourceLimit) {
  const solver = new z3.Solver();
  solver.set('rlimit', resourceLimit);
  solver.add(...assertions);
  return solver.check();
}

export async function decide(conditions, query, { resourceLimit = DEFAULT_RESOURCE_LIMIT } = {}) {
  const z3 = await solverContext();
  const encoding = { z3, atoms: new Map(), constants: new Map(), integers: new Map() };
  const path = conditions.map((condition) => encode(encoding, condition));
  const asked = encode(encoding, query);
  const facts = [...distinctLiterals(encoding), ...path];
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
