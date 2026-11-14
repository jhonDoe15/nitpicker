import { foldTerm, isBooleanValued, term } from '../../logic/terms.mjs';
import { counterexampleSync, decideSync } from '../../logic/sync/decide-sync.mjs';
import { THRESHOLDS } from '../thresholds.mjs';
import { KEY_MODES, keyOf } from '../tree/keys.mjs';
import { sizeOf } from '../tree/nodes.mjs';
import { fallbackKey, outcomesOf, programOf } from './program.mjs';

const MAX_OUTCOMES = 12;
const SOLVER_TIMEOUT_MS = 120_000;
const INTEGER = /^-?\d+$/u;
const ARITHMETIC = new Set(['+', '-', '*']);
const NUMERIC = new Set([...ARITHMETIC, '<', '<=', '>', '>=', '===', '!==']);
const LEAVES = new Set(['name', 'member', 'call', 'index']);
const PARAMETER_ATOM = /name:"\$p(?<index>\d+)"/gu;
const VALUE_ATOM = /name:"#value (?<text>[^"]*)"/gu;
const PARAMETER = /\$p(?<index>\d+)/gu;

function and(left, right) {
  return term('logical', '&&', [left, right]);
}

function or(left, right) {
  return term('logical', '||', [left, right]);
}

function not(operand) {
  return term('unary', '!', [operand]);
}

function iff(left, right) {
  return or(and(left, right), and(not(left), not(right)));
}

function sameValue(left, right) {
  return isBooleanValued(left) || isBooleanValued(right)
    ? iff(left, right)
    : term('binary', '===', [left, right]);
}

function integralOf(node, children) {
  if (node.kind === 'literal') {
    return INTEGER.test(node.value);
  }
  if (LEAVES.has(node.kind)) {
    return node.integer === true;
  }
  if (node.kind === 'conditional') {
    return children[1].integral && children[2].integral;
  }
  const arithmetic =
    (node.kind === 'binary' && ARITHMETIC.has(node.value)) ||
    (node.kind === 'unary' && node.value === '-');
  return arithmetic && children.every((child) => child.integral);
}

function isNumericUse(node) {
  return (
    (node.kind === 'binary' && NUMERIC.has(node.value)) ||
    (node.kind === 'unary' && node.value === '-')
  );
}

function isIntegerQuery(query) {
  return foldTerm(query, (node, children) => ({
    integral: integralOf(node, children),
    valid:
      children.every((child) => child.valid) &&
      (!isNumericUse(node) || children.every((child) => child.integral)),
  })).valid;
}

function firingConditions(outcomes) {
  const firing = new Map();
  const before = [];
  for (const { condition, key } of outcomes) {
    const fires = before.reduceRight((rest, previous) => and(not(previous), rest), condition);
    firing.set(key, firing.has(key) ? or(firing.get(key), fires) : fires);
    before.push(condition);
  }
  return firing;
}

function localValues(program) {
  return program.state.declared.map(({ name }) => program.context.locals.get(name));
}

function outcomeChecks(left, right) {
  const [mine, theirs] = [left, right].map(firingConditions);
  const keys = [...new Set([...mine.keys(), ...theirs.keys()])];
  if (keys.some((key) => !(mine.has(key) && theirs.has(key)))) {
    return undefined;
  }
  return keys.map((key, index) => ({
    subject: `outcome ${String(index + 1)}`,
    query: iff(mine.get(key), theirs.get(key)),
  }));
}

function localChecks(left, right) {
  const [mine, theirs] = [left, right].map(localValues);
  if (mine.length !== theirs.length || [...mine, ...theirs].some((value) => value === undefined)) {
    return undefined;
  }
  return mine.map((value, index) => ({
    subject: `local ${String(index + 1)}`,
    query: sameValue(value, theirs[index]),
  }));
}

function checksOf(sides) {
  const programs = sides.map(({ unit, tree }) => programOf(unit, tree));
  const outcomes = programs.map((program, index) => outcomesOf(program, sides[index].tree));
  const comparable =
    outcomes.every((list) => list !== undefined && list.length <= MAX_OUTCOMES) &&
    fallbackKey(programs[0], sides[0].tree) === fallbackKey(programs[1], sides[1].tree);
  if (!comparable) {
    return undefined;
  }
  const checks = [outcomeChecks(...outcomes), localChecks(...programs)];
  return checks.some((list) => list === undefined) ? undefined : checks.flat();
}

function isLargeEnough({ tree }) {
  return sizeOf(tree) >= THRESHOLDS.minSharedNodes;
}

function signatureOf({ tree }) {
  const [returned, parameters] = tree.children;
  const types = [returned, ...parameters.children.map(({ children: [type] }) => type)];
  return types.map((type) => keyOf(type, KEY_MODES.exact)).join('|');
}

function optionsOf(query) {
  return { timeoutMs: SOLVER_TIMEOUT_MS, integers: isIntegerQuery(query) };
}

function parameterNamer(names) {
  return (atom, index) => names[Number(index)] ?? atom;
}

function readable(counterexample, { tree }) {
  const names = tree.children[1].children.map(({ children: [, name] }) => name.text ?? name.value);
  const named = parameterNamer(names);
  return counterexample
    ?.replaceAll(VALUE_ATOM, (_atom, text) => `(${text.replaceAll(PARAMETER, named)})`)
    .replaceAll(PARAMETER_ATOM, named);
}

export function proveSameLogic(sides) {
  if (!sides.every(isLargeEnough) || signatureOf(sides[0]) !== signatureOf(sides[1])) {
    return undefined;
  }
  const checks = checksOf(sides);
  if (checks === undefined || checks.length === 0) {
    return undefined;
  }
  const failed = checks.find(({ query }) => decideSync([], query, optionsOf(query)) !== 'true');
  if (failed === undefined) {
    return { proved: true };
  }
  const counterexample = counterexampleSync([], failed.query, optionsOf(failed.query));
  return {
    proved: false,
    subject: failed.subject,
    counterexample: readable(counterexample, sides[0]),
  };
}
