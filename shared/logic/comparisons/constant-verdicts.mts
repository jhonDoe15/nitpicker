type Value = number | string;
type Constant = { readonly kind: string; readonly value: Value };
type Comparison = { readonly operator: string; readonly constant: Constant };
type Sample = { readonly kind: string; readonly value: Value };
type Verdict<Compared> =
  | { readonly verdict: 'impossible' }
  | { readonly verdict: 'always' }
  | {
      readonly verdict: 'implied' | 'covered';
      readonly redundant: Compared;
      readonly deciding: Compared;
    };

function below(left: Value, right: Value): boolean {
  return typeof left === 'string' && typeof right === 'string'
    ? left < right
    : Number(left) < Number(right);
}

function atMost(left: Value, right: Value): boolean {
  return typeof left === 'string' && typeof right === 'string'
    ? left <= right
    : Number(left) <= Number(right);
}

const RELATIONS = new Map<string, (value: Value, constant: Value) => boolean>([
  ['<', (value, constant) => below(value, constant)],
  ['<=', (value, constant) => atMost(value, constant)],
  ['>', (value, constant) => below(constant, value)],
  ['>=', (value, constant) => atMost(constant, value)],
]);

export function isRelation(operator: string): boolean {
  return RELATIONS.has(operator);
}

const POLARITIES = new Map<string, boolean>([
  ['===', true],
  ['==', true],
  ['!==', false],
  ['!=', false],
]);

function holds(comparison: Comparison, sample: Sample): boolean {
  const { operator, constant } = comparison;
  const relation = RELATIONS.get(operator);
  if (relation !== undefined) {
    return relation(sample.value, constant.value);
  }
  const equal = sample.kind === constant.kind && sample.value === constant.value;
  return POLARITIES.get(operator) === equal;
}

export function numberSamples(first: number, second: number): Sample[] {
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

function implies(samples: readonly Sample[], premise: Comparison, conclusion: Comparison): boolean {
  return samples.every((sample) => !holds(premise, sample) || holds(conclusion, sample));
}

export function conjunctionVerdict<Compared extends Comparison>(
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

export function disjunctionVerdict<Compared extends Comparison>(
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
