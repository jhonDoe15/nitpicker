import { combineBounds } from './validators/bounds.mjs';

function idsOf(fact) {
  return fact.entities.flatMap((entity) => fact.fields.map((field) => `${entity}#${field}`));
}

export function groupFacts(facts) {
  const groupOf = new Map();
  for (const [order, fact] of facts.entries()) {
    const ids = idsOf(fact);
    const merged = { ids: new Set(ids), members: [{ fact, order }] };
    for (const group of new Set(ids.flatMap((id) => groupOf.get(id) ?? []))) {
      merged.members.push(...group.members);
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

function smallestBy(items, pick) {
  return items.reduce(
    (best, item) => (best === undefined || pick(item) < pick(best) ? item : best),
    undefined,
  );
}

export function analyse(group, { bound, generated }) {
  const columns = group.filter((fact) => fact.kind === 'column');
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
      (fact) => fact.bounds.max,
    ),
    bound: [...entities].some((entity) => bound.has(entity)),
  };
}

export function disagreements(spec, validation) {
  const differences = [];
  for (const [key, label] of [
    ['max', 'maximum length'],
    ['min', 'minimum length'],
    ['maximum', 'maximum value'],
  ]) {
    const [specValue, validationValue] = [spec[key], validation[key]];
    if (specValue !== undefined && validationValue !== undefined && specValue !== validationValue) {
      differences.push({ label, specValue, validationValue });
    }
  }
  return differences;
}
