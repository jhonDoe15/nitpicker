import type { Relation, RelationOf } from '../../../../jpa/fetches/fetch-types.mts';
import { fieldRelation } from '../../../../jpa/fetches/fetch-paths.mts';
import { argumentOf, stringValue, typeName } from '../spring-names.mts';
import { entriesOf } from '../spring-scopes.mts';
import { appendAll } from '../../../../../../../shared/lists/items.mjs';
import type { ClassFact, Member, SourceFile } from './spring-shapes.mts';

type EntityEntry = { declared: ClassFact; members: Member[] };
type MemberRelation = { supers?: string[]; relation?: Relation | undefined };

const MAX_SUPERS = 4;

function membersOf(file: SourceFile, declared: ClassFact): Member[] {
  return [
    ...declared.primaryParameters.filter(({ property }) => property !== undefined),
    ...file.properties.filter(({ owner }) => owner === declared.qualified),
  ];
}

function namesOf(declared: ClassFact): string[] {
  const entity = declared.annotations.find(({ name }) => name === 'Entity');
  const named = stringValue(argumentOf(entity ?? { arguments: [] }, 'name', { positional: true }));
  return [...new Set([declared.name, named].filter((name): name is string => Boolean(name)))];
}

function entityIndex(projectFiles: SourceFile[]): Map<string, [string, EntityEntry][]> {
  const entries = projectFiles.flatMap((file) =>
    file.classes.flatMap((declared) =>
      namesOf(declared).map((name): [string, EntityEntry] => [
        name,
        { declared, members: membersOf(file, declared) },
      ]),
    ),
  );
  return Map.groupBy(entries, ([name]) => name);
}

function memberRelation({ declared, members }: EntityEntry, field: string): MemberRelation {
  const member = members.find(({ name }) => name === field);
  if (member === undefined) {
    return { supers: declared.supers.map((name) => typeName(name).split('.').at(-1) ?? '') };
  }
  const annotations = entriesOf(member).map(({ name }) => name);
  return { relation: fieldRelation(member.type ?? member.initializer ?? '', annotations) };
}

export function relations(projectFiles: SourceFile[]): RelationOf {
  const index = entityIndex(projectFiles);
  return function relationOf(entity: string, field: string): Relation | undefined {
    const pending = [entity];
    for (const current of pending) {
      const found = index.get(current) ?? [];
      const own: MemberRelation =
        found.length === 1 && found[0] !== undefined ? memberRelation(found[0][1], field) : {};
      if (own.relation !== undefined) {
        return own.relation;
      }
      appendAll(pending, pending.length > MAX_SUPERS ? [] : (own.supers ?? []));
    }
    return undefined;
  };
}
