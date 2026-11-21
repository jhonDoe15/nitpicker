import { combineBounds } from './validators/bounds.mts';
import { appendAll } from '../../lists/lists.mts';
import type { AnyBounds, ColumnFact, CombinedBounds, Difference, Fact } from './fact-types.mts';

type Member = { readonly fact: Fact; readonly order: number };
type Merged = { ids: Set<string>; readonly members: Member[] };
type Analysis = {
  readonly column: ColumnFact | undefined;
  readonly explicit: Fact[];
  readonly specs: Fact[];
  readonly effective: CombinedBounds;
  readonly explicitBounds: CombinedBounds;
  readonly limiting: Fact | undefined;
  readonly bound: boolean;
};

function isColumnFact(fact: Fact): fact is ColumnFact {
  return fact.kind === 'column' && fact.width !== undefined;
}

function idsOf(fact: Fact): string[] {
  return fact.entities.flatMap((entity) => fact.fields.map((field) => `${entity}#${field}`));
}

export function groupFacts(facts: readonly Fact[]): Fact[][] {
  const groupOf = new Map<string, Merged>();
  for (const [order, fact] of facts.entries()) {
    const ids = idsOf(fact);
    const merged: Merged = { ids: new Set(ids), members: [{ fact, order }] };
    for (const group of new Set(ids.flatMap((id) => groupOf.get(id) ?? []))) {
      appendAll(merged.members, group.members);
      merged.ids = new Set([...merged.ids, ...group.ids]);
    }
    for (const id of merged.ids) {
      groupOf.set(id, merged);
    }
  }
  return [...new Set(groupOf.values())].map((group) =>
    group.members.sort((left, right) => left.order - right.order).map(({ fact }) => fact),
  );
}

function smallestBy<T>(items: readonly T[], pick: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>(
    (best, item) => (best === undefined || pick(item) < pick(best) ? item : best),
    undefined,
  );
}

export function analyse(
  group: readonly Fact[],
  { bound, generated }: { readonly bound: ReadonlySet<string>; readonly generated: boolean },
): Analysis {
  const columns = group.filter(isColumnFact);
  const explicit = group.filter((fact) => fact.kind === 'validation');
  const specs = group.filter((fact) => fact.kind === 'spec');
  const effective = generated ? [...explicit, ...specs] : explicit;
  const entities = new Set(group.flatMap((fact) => fact.entities));
  return {
    column: smallestBy(columns, (fact) => fact.width),
    explicit,
    specs,
    effective: combineBounds(effective.map((fact) => fact.bounds)),
    explicitBounds: combineBounds(explicit.map((fact) => fact.bounds)),
    limiting: smallestBy(
      effective.filter((fact) => fact.bounds.max !== undefined),
      (fact) => fact.bounds.max ?? Number.POSITIVE_INFINITY,
    ),
    bound: [...entities].some((entity) => bound.has(entity)),
  };
}

export function disagreements(spec: AnyBounds, validation: AnyBounds): Difference[] {
  const differences: Difference[] = [];
  for (const [key, label] of [
    ['max', 'maximum length'],
    ['min', 'minimum length'],
    ['maximum', 'maximum value'],
  ] as const) {
    const [specValue, validationValue] = [spec[key], validation[key]];
    if (specValue !== undefined && validationValue !== undefined && specValue !== validationValue) {
      differences.push({ label, specValue, validationValue });
    }
  }
  return differences;
}
