const RELATIONS = new Map([
  ['<', (value, constant) => value < constant],
  ['<=', (value, constant) => value <= constant],
  ['>', (value, constant) => value > constant],
  ['>=', (value, constant) => value >= constant],
]);
export function isRelation(operator) {
  return RELATIONS.has(operator);
}

const POLARITIES = new Map([
  ['===', true],
  ['==', true],
  ['!==', false],
  ['!=', false],
]);

function holds(comparison, sample) {
  const { operator, constant } = comparison;
  const relation = RELATIONS.get(operator);
  if (relation !== undefined) {
    return relation(sample.value, constant.value);
  }
  const equal = sample.kind === constant.kind && sample.value === constant.value;
  return POLARITIES.get(operator) === equal;
}

export function numberSamples(first, second) {
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

function implies(samples, premise, conclusion) {
  return samples.every((sample) => !holds(premise, sample) || holds(conclusion, sample));
}

export function conjunctionVerdict(samples, first, second) {
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

export function disjunctionVerdict(samples, first, second) {
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
