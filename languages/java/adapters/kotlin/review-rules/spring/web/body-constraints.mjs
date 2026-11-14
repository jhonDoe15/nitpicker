import { BODY_STATUS } from '../../validation/constraint-names.mjs';
import { annotationIn, resolvesTo, typeName } from '../spring-names.mjs';
import { CONSTRAINT, CONSTRAINTS, VALID } from '../spring-types.mjs';
import { membersOfClass } from '../view/project-types.mjs';

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

function isConstraint(scope, entry) {
  const name = entry.type ?? entry.name;
  return (
    (resolvesTo(scope.resolve, name, CONSTRAINTS) && !resolvesTo(scope.resolve, name, VALID)) ||
    scope.metaAnnotated(typeName(name), CONSTRAINT)
  );
}

function cascades(scope, entries) {
  return annotationIn(scope.resolve, entries, VALID) !== undefined;
}

function namesIn(text) {
  return (text ?? '')
    .replaceAll(/[?!]/gu, '')
    .match(TYPE_NAMES)
    ?.filter((name) => /^\p{Lu}/u.test(name.split('.').at(-1)) && !KNOWN.has(name));
}

function relatedNames(scope, found, members) {
  return [
    ...found.declared.supers.flatMap((type) => namesIn(type) ?? []),
    ...members
      .filter((member) => cascades(scope, member.annotationEntries))
      .flatMap((member) => namesIn(member.type) ?? []),
  ];
}

function declaresConstraint(scope, found, members) {
  const annotations = [
    ...found.declared.annotations,
    ...(found.declared.constructorAnnotations ?? []),
    ...members.flatMap((member) => member.annotationEntries ?? []),
  ];
  return annotations.some((entry) => isConstraint(scope, entry));
}

function step(view, item, seen) {
  const found = item.scope.projectClass(item.name);
  if (found === undefined) {
    return { unresolved: true, next: [] };
  }
  if (seen.has(found.declared.qualified)) {
    return { next: [] };
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

export function bodyConstraints(view, type) {
  const root = view.scopedTo(view.file);
  const queue = (namesIn(type) ?? []).map((name) => ({ scope: root, name, root: true }));
  const seen = new Set();
  let unresolved = false;
  for (const item of queue) {
    const result = step(view, item, seen);
    if (result.constrained) {
      return BODY_STATUS.constrained;
    }
    unresolved ||= result.unresolved === true;
    queue.push(...result.next);
  }
  return unresolved ? BODY_STATUS.unresolved : BODY_STATUS.unconstrained;
}
