import { key } from '../../../../../../shared/logic/terms.mjs';
import { isStable } from './operand-terms.mjs';

const RELATIONS = new Map([
  ['<', (value, constant) => value < constant],
  ['<=', (value, constant) => value <= constant],
  ['>', (value, constant) => value > constant],
  ['>=', (value, constant) => value >= constant],
]);
const EQUALITIES = new Set(['===', '!==']);
const MIRRORED = new Map([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
  ['===', '==='],
  ['!==', '!=='],
]);

function numberConstant(node) {
  const negated = node.kind === 'unary' && node.value === '-';
  const literal = negated ? node.children[0] : node;
  if (literal.kind !== 'literal' || typeof literal.value !== 'string') {
    return undefined;
  }
  const isText = literal.value.startsWith('"') || literal.value.trim() === '';
  const value = isText ? Number.NaN : Number(literal.value);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return { kind: 'number', value: negated ? -value : value };
}

function constantOf(node) {
  const number = numberConstant(node);
  if (number !== undefined) {
    return number;
  }
  const isString = node.kind === 'literal' && String(node.value).startsWith('"');
  return isString ? { kind: 'string', value: JSON.parse(node.value) } : undefined;
}

function oriented(node) {
  const [left, right] = node.children;
  const onRight = constantOf(right);
  if (onRight !== undefined) {
    return { subject: left, operator: node.value, constant: onRight };
  }
  const onLeft = constantOf(left);
  return onLeft === undefined
    ? undefined
    : { subject: right, operator: MIRRORED.get(node.value), constant: onLeft };
}

export function constantComparison(term) {
  if (term.kind !== 'binary' || !MIRRORED.has(term.value)) {
    return undefined;
  }
  const comparison = oriented(term);
  if (comparison === undefined || !isStable(comparison.subject)) {
    return undefined;
  }
  const isRelation = RELATIONS.has(comparison.operator);
  if (isRelation && comparison.constant.kind !== 'number') {
    return undefined;
  }
  return { ...comparison, subjectKey: key(comparison.subject) };
}

function holds(comparison, sample) {
  const { operator, constant } = comparison;
  if (RELATIONS.has(operator)) {
    return RELATIONS.get(operator)(sample.value, constant.value);
  }
  const equal = sample.kind === constant.kind && sample.value === constant.value;
  return EQUALITIES.has(operator) && (operator === '===') === equal;
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

/** How two comparisons of one operand against constants combine under `&&` or `||`, if wrongly. */
export function comparisonVerdict(operator, first, second) {
  if (first.subjectKey !== second.subjectKey || first.constant.kind !== second.constant.kind) {
    return undefined;
  }
  const samples = samplesFor(first.constant, second.constant);
  return operator === '&&'
    ? conjunctionVerdict(samples, first, second)
    : disjunctionVerdict(samples, first, second);
}
