import { fieldOf, fieldsOf, listOf, type Fields } from '../../../values/readers.mts';

const TYPES = 'types';
const CALLABLES = 'callables';
const TARGET = 'target';

type ListName = typeof TYPES | typeof CALLABLES;
type Ids = Readonly<Record<ListName, ReadonlySet<unknown>>>;
type Reference = readonly [string, unknown, ListName];

function itemsOf(value: unknown): Fields[] {
  return listOf(value).map(fieldsOf);
}

function duplicateId(list: ListName, items: readonly Fields[]): string | undefined {
  const seen = new Set<unknown>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item['id'])) {
      return `facts.${list}[${String(index)}].id ${JSON.stringify(item['id'])} is used twice: ids are unique within their list`;
    }
    seen.add(item['id']);
  }
  return undefined;
}

function isSubject(typeIds: ReadonlySet<unknown>, subject: unknown): boolean {
  if (typeIds.has(subject)) {
    return true;
  }
  const text = typeof subject === 'string' ? subject : '';
  const dot = text.lastIndexOf('.');
  return dot > 0 && typeIds.has(text.slice(0, dot));
}

function listedReferences(item: Fields): Reference[] {
  return listOf(item['references']).map((target, index): Reference => [
    `references[${String(index)}]`,
    target,
    CALLABLES,
  ]);
}

function typeReferences(type: Fields): Reference[] {
  return [
    ...listedReferences(type),
    ...listOf(type['supertypes']).map((target, index): Reference => [
      `supertypes[${String(index)}]`,
      target,
      TYPES,
    ]),
  ];
}

type Located = { readonly list: ListName; readonly index: number; readonly item: Fields };

function danglingReference(
  { list, index, item }: Located,
  ids: Ids,
  referencesOf: (item: Fields) => Reference[],
): string | undefined {
  const dangling = referencesOf(item).find(([, value, target]) => !ids[target].has(value));
  if (dangling === undefined) {
    return undefined;
  }
  const [field, value, target] = dangling;
  return `facts.${list}[${String(index)}].${field} is ${JSON.stringify(value)}, which is not an id in facts.${target}: only list references the producer resolved`;
}

function danglingTypeReference(types: readonly Fields[], ids: Ids): string | undefined {
  for (const [index, item] of types.entries()) {
    const problem = danglingReference({ list: TYPES, index, item }, ids, typeReferences);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

function callableReferences(callable: Fields): Reference[] {
  const references: Reference[] = [
    ['owner', callable['owner'], TYPES],
    ['forward.target', fieldOf(callable['forward'], TARGET), CALLABLES],
    ...listOf(callable['calls']).map((call, index): Reference => [
      `calls[${String(index)}].target`,
      fieldOf(call, TARGET),
      CALLABLES,
    ]),
    ...listOf(callable['paramUses']).flatMap((use, index) =>
      listOf(fieldOf(use, 'forwards')).map((forward, position): Reference => [
        `paramUses[${String(index)}].forwards[${String(position)}].target`,
        fieldOf(forward, TARGET),
        CALLABLES,
      ]),
    ),
    ...listedReferences(callable),
    ...listOf(callable['reads']).map((read, index): Reference => [
      `reads[${String(index)}].type`,
      fieldOf(read, 'type'),
      TYPES,
    ]),
  ];
  return references.filter(([, value]) => value !== undefined);
}

function danglingCallableReference(callables: readonly Fields[], ids: Ids): string | undefined {
  for (const [index, callable] of callables.entries()) {
    const located = { list: CALLABLES, index, item: callable } as const;
    const dangling = danglingReference(located, ids, callableReferences);
    if (dangling !== undefined) {
      return dangling;
    }
    const decisions = listOf(callable['decisions']);
    const decision = decisions.findIndex((item) => !isSubject(ids.types, fieldOf(item, 'subject')));
    if (decision !== -1) {
      return `facts.callables[${String(index)}].decisions[${String(decision)}].subject is ${JSON.stringify(fieldOf(decisions[decision], 'subject'))}, which is neither a type id nor "<type id>.<field>"`;
    }
  }
  return undefined;
}

function unknownFile(
  list: ListName,
  items: readonly Fields[],
  modules: readonly unknown[] | undefined,
): string | undefined {
  if (modules === undefined) {
    return undefined;
  }
  const known = new Set<unknown>(modules.map((module) => fieldOf(module, 'file')));
  const index = items.findIndex((item) => !known.has(item['file']));
  return index === -1
    ? undefined
    : `facts.${list}[${String(index)}].file is ${JSON.stringify(items[index]?.['file'])}, which is not in facts.modules: list that file in modules, or leave the entry out`;
}

export function designReferenceProblem(
  facts: Readonly<Record<string, unknown>>,
): string | undefined {
  const types = itemsOf(facts[TYPES]);
  const callables = itemsOf(facts[CALLABLES]);
  const modules = Array.isArray(facts['modules']) ? listOf(facts['modules']) : undefined;
  const ids: Ids = {
    types: new Set(types.map(({ id }) => id)),
    callables: new Set(callables.map(({ id }) => id)),
  };
  return (
    duplicateId(TYPES, types) ??
    duplicateId(CALLABLES, callables) ??
    unknownFile(TYPES, types, modules) ??
    unknownFile(CALLABLES, callables, modules) ??
    danglingTypeReference(types, ids) ??
    danglingCallableReference(callables, ids)
  );
}
