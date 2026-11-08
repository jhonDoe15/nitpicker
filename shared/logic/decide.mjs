import { isSideEffectFree } from './purity.mjs';
import { foldTerm, isBooleanLiteral, isComparison, isLogical, isNot, key } from './terms.mjs';

const DEFAULT_RESOURCE_LIMIT = 2_000_000;

const INTEGER = /^-?\d+$/u;
const DECIMAL = /^-?\d+(?:\.\d+)?$/u;
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

function isIntegerLiteral(node) {
  return (
    node.kind === 'literal' && INTEGER.test(node.value) && Number.isSafeInteger(Number(node.value))
  );
}

function isExactNumber(node) {
  return DECIMAL.test(node.value) && (!INTEGER.test(node.value) || isIntegerLiteral(node));
}

function isArithmeticOperator(node) {
  return (
    (node.kind === 'unary' && node.value === '-') ||
    (node.kind === 'binary' && ARITHMETIC.has(node.value))
  );
}

function isIntegral(node, children) {
  if (isIntegerLiteral(node) || node.integer === true) {
    return true;
  }
  return isArithmeticOperator(node) && children.every((child) => child.integral);
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
  return memo(encoding.atoms, `${sort}:${identity}`, (index) =>
    sort === 'value' ? z3.Real.const(`a${String(index)}`) : z3.Bool.const(`a${String(index)}`),
  );
}

function literalValue(encoding, node) {
  const { z3 } = encoding;
  if (isExactNumber(node)) {
    return memo(encoding.literals, node.value, () => z3.Real.val(node.value));
  }
  return memo(encoding.literals, node.value, (index) => z3.Real.const(`c${String(index)}`));
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
  const value = atom(encoding, 'value', node);
  if (integral) {
    encoding.facts.push(encoding.z3.IsInt(value));
  }
  return value;
}

function encodeNotANumber(encoding, { node, integral }) {
  return node.kind === 'literal' || integral
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
  if (!children.every(isNumber)) {
    return atom(encoding, 'truth', node);
  }
  const [left, right] = children;
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
  const equal = numeric(encoding, children, children[0].value.eq(children[1].value));
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
    return {
      node,
      integral: encoded.integral,
      value: encodeValue(encoding, encoded),
      notANumber: encodeNotANumber(encoding, encoded),
      truth: encodeTruth(encoding, encoded),
    };
  }).truth;
}

function distinctLiterals(encoding) {
  const literals = [...encoding.literals.values()];
  return literals.length > 1 ? [encoding.z3.Distinct(...literals)] : [];
}

function satisfiable(z3, assertions, resourceLimit) {
  const solver = new z3.Solver();
  solver.set('rlimit', resourceLimit);
  solver.add(...assertions);
  return solver.check();
}

export async function decide(conditions, query, options = {}) {
  const { resourceLimit = DEFAULT_RESOURCE_LIMIT, sameCalls = false } = options;
  const z3 = await solverContext();
  const encoding = { z3, sameCalls, atoms: new Map(), literals: new Map(), facts: [] };
  const path = conditions.map((condition) => encode(encoding, condition));
  const asked = encode(encoding, query);
  const facts = [...distinctLiterals(encoding), ...encoding.facts, ...path];
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
