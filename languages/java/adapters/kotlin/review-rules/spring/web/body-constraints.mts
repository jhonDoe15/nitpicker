import { BODY_STATUS } from '../../validation/constraint-names.mts';
import { annotationIn, resolvesTo, typeName } from '../spring-names.mts';
import { CONSTRAINT, CONSTRAINTS, VALID } from '../spring-types.mts';
import { membersOfClass } from '../view/project-types.mts';
import { appendAll } from '../../../../../../../shared/lists/items.mjs';
import type {
  Annotation,
  Member,
  ProjectClass,
  ScopedView,
  SpringView,
} from '../typed/spring-shapes.mts';

type BodyItem = { scope: ScopedView; name: string; root: boolean };
type BodyStep = { constrained: boolean; unresolved: boolean; next: BodyItem[] };

const TYPE_NAMES = /[\p{L}_$][\p{L}\p{N}_$.]*/gu;
const KNOWN = new Set([
  'String',
  'CharSequence',
  'Int',
  'Long',
  'Short',
  'Byte',
  'Double',
  'Float',
  'Boolean',
  'Char',
  'Number',
  'BigDecimal',
  'BigInteger',
  'Any',
  'Serializable',
  'Comparable',
  'Enum',
  'List',
  'MutableList',
  'Set',
  'MutableSet',
  'Collection',
  'MutableCollection',
  'Iterable',
  'Array',
  'Optional',
  'Map',
  'MutableMap',
]);

function isConstraint(scope: ScopedView, entry: Annotation): boolean {
  const name = entry.type ?? entry.name;
  return (
    (resolvesTo(scope.resolve, name, CONSTRAINTS) && !resolvesTo(scope.resolve, name, VALID)) ||
    scope.metaAnnotated(typeName(name), CONSTRAINT)
  );
}

function cascades(scope: ScopedView, entries: readonly Annotation[] | undefined): boolean {
  return annotationIn(scope.resolve, entries, VALID) !== undefined;
}

function namesIn(text: string | undefined): string[] | undefined {
  return (text ?? '')
    .replaceAll(/[?!]/gu, '')
    .match(TYPE_NAMES)
    ?.filter((name) => /^\p{Lu}/u.test(name.split('.').at(-1) ?? '') && !KNOWN.has(name));
}

function relatedNames(scope: ScopedView, found: ProjectClass, members: Member[]): string[] {
  return [
    ...found.declared.supers.flatMap((type) => namesIn(type) ?? []),
    ...members
      .filter((member) => cascades(scope, member.annotationEntries))
      .flatMap((member) => namesIn(member.type) ?? []),
  ];
}

function declaresConstraint(scope: ScopedView, found: ProjectClass, members: Member[]): boolean {
  const annotations = [
    ...found.declared.annotations,
    ...(found.declared.constructorAnnotations ?? []),
    ...members.flatMap((member) => member.annotationEntries ?? []),
  ];
  return annotations.some((entry) => isConstraint(scope, entry));
}

function step(view: SpringView, item: BodyItem, seen: Set<string>): BodyStep {
  const found = item.scope.projectClass(item.name);
  if (found === undefined) {
    return { constrained: false, unresolved: true, next: [] };
  }
  if (seen.has(found.declared.qualified)) {
    return { constrained: false, unresolved: false, next: [] };
  }
  seen.add(found.declared.qualified);
  const scope = view.scopedTo(found.file);
  const members = membersOfClass(found);
  return {
    constrained: declaresConstraint(scope, found, members),
    unresolved: item.root && (found.declared.kind === 'interface' || found.declared.open),
    next: relatedNames(scope, found, members).map((name) => ({ scope, name, root: false })),
  };
}

export function bodyConstraints(view: SpringView, type: string | undefined): string {
  const root = view.scopedTo(view.file);
  const queue: BodyItem[] = (namesIn(type) ?? []).map((name) => ({
    scope: root,
    name,
    root: true,
  }));
  const seen = new Set<string>();
  let unresolved = false;
  for (const item of queue) {
    const result = step(view, item, seen);
    if (result.constrained) {
      return BODY_STATUS.constrained;
    }
    unresolved ||= result.unresolved;
    appendAll(queue, result.next);
  }
  return unresolved ? BODY_STATUS.unresolved : BODY_STATUS.unconstrained;
}
