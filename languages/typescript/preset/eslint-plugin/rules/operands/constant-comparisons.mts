import type { Term } from '../analysis/logic/estree-terms.mts';
import { key } from '../analysis/logic/term-views.mts';
import { isStable } from './operand-terms.mts';

type Constant =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string };
type Sample =
  | { readonly kind: 'number' | 'other'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string };
type Comparison = {
  readonly subject: Term;
  readonly operator: string;
  readonly constant: Constant;
};
export type ConstantComparison = Comparison & { readonly subjectKey: string };
type Decided<Compared> = {
  readonly redundant: Compared;
  readonly deciding: Compared;
};
export type Verdict<Compared> =
  | { readonly verdict: 'impossible' }
  | { readonly verdict: 'always' }
  | (Decided<Compared> & { readonly verdict: 'implied' })
  | (Decided<Compared> & { readonly verdict: 'covered' });

const RELATIONS = new Map<string, (value: number | string, constant: number | string) => boolean>([
  ['<', (value, constant) => value < constant],
  ['<=', (value, constant) => value <= constant],
  ['>', (value, constant) => value > constant],
  ['>=', (value, constant) => value >= constant],
]);
const EQUALITIES = new Set<string>(['===', '!==']);
const MIRRORED = new Map<string, string>([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
  ['===', '==='],
  ['!==', '!=='],
]);

function numberConstant(node: Term): Constant | undefined {
  const negated = node.kind === 'unary' && node.value === '-';
  const literal = negated ? node.children[0] : node;
  if (literal?.kind !== 'literal' || typeof literal.value !== 'string') {
    return undefined;
  }
  const isText = literal.value.startsWith('"') || literal.value.trim() === '';
  const value = isText ? Number.NaN : Number(literal.value);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return { kind: 'number', value: negated ? -value : value };
}

function constantOf(node: Term): Constant | undefined {
  const number = numberConstant(node);
  if (number !== undefined) {
    return number;
  }
  const text = node.value;
  if (node.kind !== 'literal' || text === undefined || !text.startsWith('"')) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === 'string' ? { kind: 'string', value: parsed } : undefined;
}

function oriented(node: Term, operator: string): Comparison | undefined {
  const [left, right] = node.children;
  if (left === undefined || right === undefined) {
    return undefined;
  }
  const onRight = constantOf(right);
  if (onRight !== undefined) {
    return { subject: left, operator, constant: onRight };
  }
  const onLeft = constantOf(left);
  return onLeft === undefined
    ? undefined
    : { subject: right, operator: MIRRORED.get(operator) ?? operator, constant: onLeft };
}

export function constantComparison(term: Term): ConstantComparison | undefined {
  const operator = term.value;
  if (term.kind !== 'binary' || operator === undefined || !MIRRORED.has(operator)) {
    return undefined;
  }
  const comparison = oriented(term, operator);
  if (comparison === undefined || !isStable(comparison.subject)) {
    return undefined;
  }
  const isRelation = RELATIONS.has(comparison.operator);
  if (isRelation && comparison.constant.kind !== 'number') {
    return undefined;
  }
  return { ...comparison, subjectKey: key(comparison.subject) };
}

function holds(comparison: Comparison, sample: Sample): boolean {
  const { operator, constant } = comparison;
  const relation = RELATIONS.get(operator);
  if (relation !== undefined) {
    return relation(sample.value, constant.value);
  }
  const equal = sample.kind === constant.kind && sample.value === constant.value;
  return EQUALITIES.has(operator) && (operator === '===') === equal;
}

function numberSamples(first: number, second: number): Sample[] {
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  const below = low - Math.max(1, Math.abs(low));
  const above = high + Math.max(1, Math.abs(high));
  const values = [below, low, low / 2 + high / 2, high, above];
  return [
    ...values.map((value): Sample => ({ kind: 'number', value })),
    ...values.map((value): Sample => ({ kind: 'other', value })),
    { kind: 'number', value: Number.NaN },
  ];
}

function samplesFor(first: Constant, second: Constant): Sample[] {
  if (first.kind === 'number' && second.kind === 'number') {
    return numberSamples(first.value, second.value);
  }
  const other = `${String(first.value)}${String(second.value)}.`;
  return [first.value, second.value, other].map((value): Sample => ({
    kind: 'string',
    value: String(value),
  }));
}

function implies(samples: readonly Sample[], premise: Comparison, conclusion: Comparison): boolean {
  return samples.every((sample) => !holds(premise, sample) || holds(conclusion, sample));
}

function conjunctionVerdict<Compared extends Comparison>(
  samples: readonly Sample[],
  first: Compared,
  second: Compared,
): Verdict<Compared> | undefined {
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

function disjunctionVerdict<Compared extends Comparison>(
  samples: readonly Sample[],
  first: Compared,
  second: Compared,
): Verdict<Compared> | undefined {
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
export function comparisonVerdict<Compared extends ConstantComparison>(
  operator: string,
  first: Compared,
  second: Compared,
): Verdict<Compared> | undefined {
  if (first.subjectKey !== second.subjectKey || first.constant.kind !== second.constant.kind) {
    return undefined;
  }
  const samples = samplesFor(first.constant, second.constant);
  return operator === '&&'
    ? conjunctionVerdict(samples, first, second)
    : disjunctionVerdict(samples, first, second);
}
