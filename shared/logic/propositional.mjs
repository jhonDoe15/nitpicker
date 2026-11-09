import { isSideEffectFree } from './purity.mjs';
import { foldTerm, isBooleanLiteral, isComparison, isLogical, isNot, key } from './terms.mjs';

const MAX_ROWS = 65_536;
const RELATIONS = new Set(['===', '!==']);

function isRelation(node) {
  return isComparison(node) || (node.kind === 'binary' && RELATIONS.has(node.value));
}

function literalChoice(node) {
  if (node.kind !== 'binary' || !RELATIONS.has(node.value)) {
    return undefined;
  }
  const [left, right] = node.children;
  const [value, literal] = left.kind === 'literal' ? [right, left] : [left, right];
  const isChoice =
    literal.kind === 'literal' && value.kind !== 'literal' && isSideEffectFree(value);
  return isChoice
    ? { value: `value ${key(value)}`, literal: literal.value, equal: node.value === '===' }
    : undefined;
}

function atomKey(node, fresh) {
  if (isSideEffectFree(node)) {
    return key(node);
  }
  fresh.push(node);
  return `occurrence ${String(fresh.length)}`;
}

function choiceTest(choice, choices) {
  const literals = choices.get(choice.value) ?? new Set();
  literals.add(choice.literal);
  choices.set(choice.value, literals);
  return (assignment) => (assignment.get(choice.value) === choice.literal) === choice.equal;
}

function compile(root, { atoms, choices, fresh }) {
  return foldTerm(root, (node, children) => {
    const choice = literalChoice(node);
    if (choice !== undefined) {
      return choiceTest(choice, choices);
    }
    if (isBooleanLiteral(node)) {
      const value = node.value === 'true';
      return () => value;
    }
    if (isNot(node)) {
      return (assignment) => !children[0](assignment);
    }
    if (isLogical(node, '&&') || isLogical(node, '||')) {
      const [left, right] = children;
      return node.value === '&&'
        ? (assignment) => left(assignment) && right(assignment)
        : (assignment) => left(assignment) || right(assignment);
    }
    if (node.kind === 'conditional') {
      const [test, whenTrue, whenFalse] = children;
      return (assignment) => (test(assignment) ? whenTrue(assignment) : whenFalse(assignment));
    }
    const name = atomKey(node, fresh);
    atoms.add(name);
    return (assignment) => assignment.get(name);
  });
}

const OTHER = Symbol('another value');

function dimensions({ atoms, choices }) {
  return [
    ...[...atoms].map((name) => ({ name, options: [false, true] })),
    ...[...choices].map(([name, literals]) => ({ name, options: [...literals, OTHER] })),
  ];
}

function rowCount(axes) {
  return axes.reduce((product, { options }) => product * options.length, 1);
}

function assignment(axes, row) {
  const pairs = [];
  let rest = row;
  for (const { name, options } of axes) {
    pairs.push([name, options[rest % options.length]]);
    rest = Math.trunc(rest / options.length);
  }
  return new Map(pairs);
}

function verdict({ canHold, canFail }) {
  if (!canHold && !canFail) {
    return 'unreachable';
  }
  if (!canFail) {
    return 'true';
  }
  return canHold ? 'open' : 'false';
}

function outcomes(axes, path, asked) {
  const seen = { canHold: false, canFail: false };
  for (const row of Array.from({ length: rowCount(axes) }, (_, index) => index)) {
    const values = assignment(axes, row);
    if (path.every((condition) => condition(values))) {
      const holds = Boolean(asked(values));
      seen.canHold ||= holds;
      seen.canFail ||= !holds;
    }
    if (seen.canHold && seen.canFail) {
      break;
    }
  }
  return seen;
}

/**
 * `decide` by enumeration: a strict equality of a value with a literal picks one of the literals
 * the value is compared with, or another value; everything else is an independent truth atom. A
 * 'true', 'false' or 'unreachable' answer also holds for `decide`, an 'open' one may not.
 * `undefined` when the table would be too large.
 */
export function decideByTruthTable(conditions, query) {
  const table = { atoms: new Set(), choices: new Map(), fresh: [] };
  const path = conditions.map((condition) => compile(condition, table));
  const asked = compile(query, table);
  const axes = dimensions(table);
  if (rowCount(axes) > MAX_ROWS) {
    return undefined;
  }
  return verdict(outcomes(axes, path, asked));
}

function relationOperands(root) {
  return foldTerm(root, (node, children) => {
    const below = children.flat();
    if (literalChoice(node) !== undefined) {
      return below;
    }
    const operands = node.children.filter((child) => child.kind !== 'literal');
    return isRelation(node) ? [...below, ...operands.map((child) => key(child))] : below;
  });
}

function choiceValues(root) {
  return foldTerm(root, (node, children) => {
    const choice = literalChoice(node);
    const below = children.flat();
    return choice === undefined ? below : [...below, choice.value];
  });
}

function isChosenAndCompared(terms) {
  const compared = new Set(terms.flatMap((root) => relationOperands(root)));
  return terms
    .flatMap((root) => choiceValues(root))
    .some((value) => compared.has(value.slice('value '.length)));
}

/**
 * Whether values link the query to the conditions: a comparison or strict equality in the query
 * shares an operand with one in the conditions or in the query, or a value compared with a literal
 * is also compared otherwise. Without that link the truth table answers exactly what `decide`
 * would.
 */
export function needsValues(conditions, query) {
  const asked = relationOperands(query);
  const known = new Set(conditions.flatMap((condition) => relationOperands(condition)));
  const isLinked = asked.some(
    (operand, index) => known.has(operand) || asked.indexOf(operand) !== index,
  );
  return isLinked || isChosenAndCompared([...conditions, query]);
}
