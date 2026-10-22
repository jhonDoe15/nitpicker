import { pluginOpener } from '../rules/proxies.mjs';
import { annotationIn, argumentOf, typeName } from '../spring-names.mjs';
import { entriesOf, report } from '../spring-scopes.mjs';
import {
  ENTITY,
  ENTITY_CLASSES,
  GENERATED_VALUE,
  IDS,
  IMMUTABLE,
  LIST_TYPES,
  MANY_TO_MANY,
  ORDER_COLUMN,
  TO_MANY,
  TO_ONE,
  VERSION,
} from './data-types.mjs';

const LAZY = /\bLAZY\b/u;
const EAGER = /\bEAGER\b/u;
const SHARED_CASCADE = /\b(?:ALL|REMOVE)\b/u;
const BATCH_BREAKING_IDS = /\b(?:IDENTITY|TABLE)\b/u;

export function membersOf(view, declared) {
  return [
    ...declared.primaryParameters.filter(({ property }) => property !== undefined),
    ...view
      .propertiesOf(declared.qualified)
      .filter(({ computed, delegated }) => computed !== true && delegated !== true),
  ];
}

export function annotatedWith(view, member, fqns) {
  return annotationIn(view.resolve, entriesOf(member), fqns);
}

function annotatedMembers(view) {
  return [
    ...view.file.classes.flatMap((declared) =>
      membersOf(view, declared).map((member) => ({ member, owner: declared.qualified })),
    ),
    ...view.file.functions.map((member) => ({ member, owner: member.owner })),
  ].filter(({ member }) => entriesOf(member).length > 0);
}

function mappingFindings(view, member, symbol) {
  return entriesOf(member).flatMap((entry) => {
    const type = entry.type ?? entry.name;
    const fetch = argumentOf(entry, 'fetch') ?? '';
    const checks = [
      ['JpaLazyFetching', view.is(type, TO_ONE) && !LAZY.test(fetch)],
      ['JpaLazyFetching', view.is(type, TO_MANY) && EAGER.test(fetch)],
      [
        'JpaManyToManyCascade',
        view.is(type, MANY_TO_MANY) && SHARED_CASCADE.test(argumentOf(entry, 'cascade') ?? ''),
      ],
      [
        'JpaSequenceIds',
        view.is(type, GENERATED_VALUE) &&
          BATCH_BREAKING_IDS.test(argumentOf(entry, 'strategy') ?? ''),
      ],
    ];
    return checks.filter(([, flagged]) => flagged).map(([rule]) => report(rule, member, symbol));
  });
}

function mappings(view) {
  return annotatedMembers(view).flatMap(({ member, owner }) =>
    mappingFindings(view, member, `${owner}.${member.name}`),
  );
}

function manyToManyLists(view) {
  return annotatedMembers(view)
    .filter(({ member }) => annotatedWith(view, member, MANY_TO_MANY) !== undefined)
    .filter(({ member }) => annotatedWith(view, member, ORDER_COLUMN) === undefined)
    .filter(({ member }) => LIST_TYPES.has(typeName(member.type ?? member.initializer)))
    .map(({ member, owner }) => report('JpaManyToManySet', member, `${owner}.${member.name}`));
}

function entityClasses(view, { allOpen }) {
  const opened = pluginOpener(view, allOpen);
  return view.file.classes
    .filter((declared) => annotationIn(view.resolve, declared.annotations, ENTITY) !== undefined)
    .filter(
      (declared) =>
        declared.data ||
        declared.kind !== 'class' ||
        (opened !== undefined && !declared.open && !opened(declared)),
    )
    .map((declared) => report('JpaEntityClass', declared, declared.qualified));
}

function versioned(view, declared) {
  const members = membersOf(view, declared);
  const entity = annotationIn(view.resolve, declared.annotations, ENTITY) !== undefined;
  const ownId = members.some((member) => annotatedWith(view, member, IDS) !== undefined);
  const needsVersion = (entity && declared.superClass === undefined) || ownId;
  return (
    !needsVersion ||
    annotationIn(view.resolve, declared.annotations, IMMUTABLE) !== undefined ||
    members.some((member) => annotatedWith(view, member, VERSION) !== undefined)
  );
}

function versions(view) {
  return view.file.classes
    .filter(
      (declared) => annotationIn(view.resolve, declared.annotations, ENTITY_CLASSES) !== undefined,
    )
    .filter((declared) => !versioned(view, declared))
    .map((declared) => report('JpaVersion', declared, declared.qualified));
}

export const ENTITY_RULES = [mappings, manyToManyLists, entityClasses, versions];
