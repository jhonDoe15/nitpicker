import { isStable, nodeKey, nodeText, unwrapped } from './operand-terms.mjs';

const RELATIONS = new Map([
  ['<', (value, constant) => value < constant],
  ['<=', (value, constant) => value <= constant],
  ['>', (value, constant) => value > constant],
  ['>=', (value, constant) => value >= constant],
]);
const EQUALITIES = new Set(['==', '!=']);
const MIRRORED = new Map([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
  ['==', '=='],
  ['!=', '!='],
]);
const INTEGER = /^(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+)(L?)$/;
const DECIMAL = /^(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?$/;

function numberValue(text) {
  const plain = text.replaceAll('_', '');
  const integer = INTEGER.exec(plain);
  if (integer !== null) {
    const value = Number(plain.replace(/L$/, ''));
    return Number.isSafeInteger(value)
      ? { value, type: integer[1] === 'L' ? 'Long' : 'Int' }
      : undefined;
  }
  return DECIMAL.test(plain) ? { value: Number(plain), type: 'Double' } : undefined;
}

function constantOf(forest, node) {
  const inner = unwrapped(forest, node);
  if (inner.operator !== undefined) {
    return undefined;
  }
  const tokens = inner.items.map((item) => forest.tokens[item.token]);
  const negated =
    tokens.length === 2 && tokens[0].text === '-' && inner.items[1].close === undefined;
  const [literal] = negated ? tokens.slice(1) : tokens;
  if (tokens.length !== (negated ? 2 : 1)) {
    return undefined;
  }
  if (literal.kind === 'number') {
    const number = numberValue(literal.text);
    return (
      number && { kind: 'number', type: number.type, value: negated ? -number.value : number.value }
    );
  }
  const { literal: string } = literal;
  const isPlain =
    literal.kind === 'string' && !string.template && !string.text.includes('\\') && !negated;
  return isPlain ? { kind: 'string', type: 'String', value: string.text } : undefined;
}

function oriented(forest, node) {
  const onRight = constantOf(forest, node.right);
  if (onRight !== undefined) {
    return { subject: node.left, operator: node.operator, constant: onRight };
  }
  const onLeft = constantOf(forest, node.left);
  return onLeft && { subject: node.right, operator: MIRRORED.get(node.operator), constant: onLeft };
}

/** A comparison of a stable operand with a number or string constant, or undefined. */
export function constantComparison(forest, node) {
  const inner = unwrapped(forest, node);
  if (!MIRRORED.has(inner.operator)) {
    return undefined;
  }
  const comparison = oriented(forest, inner);
  if (comparison === undefined || !isStable(forest, comparison.subject)) {
    return undefined;
  }
  if (RELATIONS.has(comparison.operator) && comparison.constant.kind !== 'number') {
    return undefined;
  }
  return {
    ...comparison,
    key: nodeKey(forest, inner),
    subjectKey: nodeKey(forest, comparison.subject),
    text: nodeText(forest, inner),
  };
}

function holds(comparison, sample) {
  const { operator, constant } = comparison;
  if (RELATIONS.has(operator)) {
    return RELATIONS.get(operator)(sample.value, constant.value);
  }
  const equal = sample.kind === constant.kind && sample.value === constant.value;
  return EQUALITIES.has(operator) && (operator === '==') === equal;
}

function numberSamples(first, second) {
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  const below = low - Math.max(1, Math.abs(low));
  const above = high + Math.max(1, Math.abs(high));
  const values = [below, low, low / 2 + high / 2, high, above];
  return [
    ...values.map((value) => ({ kind: 'number', value })),
    ...values.map((value) => ({ kind: 'other', value })),
    { kind: 'number', value: Number.NaN },
  ];
}

function samplesFor(first, second) {
  if (first.kind === 'number') {
    return numberSamples(first.value, second.value);
  }
  const other = `${first.value}${second.value}.`;
  return [first.value, second.value, other].map((value) => ({ kind: 'string', value }));
}

function implies(samples, premise, conclusion) {
  return samples.every((sample) => !holds(premise, sample) || holds(conclusion, sample));
}

function conjunctionVerdict(samples, first, second) {
  if (!samples.some((sample) => holds(first, sample) && holds(second, sample))) {
    return { verdict: 'impossible' };
  }
  if (implies(samples, first, second)) {
    return { verdict: 'implied', redundant: second, deciding: first };
  }
  return implies(samples, second, first)
    ? { verdict: 'implied', redundant: first, deciding: second }
    : undefined;
}

function disjunctionVerdict(samples, first, second) {
  if (samples.every((sample) => holds(first, sample) || holds(second, sample))) {
    return { verdict: 'always' };
  }
  if (implies(samples, first, second)) {
    return { verdict: 'covered', redundant: first, deciding: second };
  }
  return implies(samples, second, first)
    ? { verdict: 'covered', redundant: second, deciding: first }
    : undefined;
}

function comparable(first, second) {
  if (first.subjectKey !== second.subjectKey || first.constant.kind !== second.constant.kind) {
    return false;
  }
  const equality = EQUALITIES.has(first.operator) || EQUALITIES.has(second.operator);
  return !equality || first.constant.type === second.constant.type;
}

/** How two comparisons of one operand against constants combine under `&&` or `||`, if wrongly. */
export function comparisonVerdict(operator, first, second) {
  if (!comparable(first, second)) {
    return undefined;
  }
  const samples = samplesFor(first.constant, second.constant);
  return operator === '&&'
    ? conjunctionVerdict(samples, first, second)
    : disjunctionVerdict(samples, first, second);
}
