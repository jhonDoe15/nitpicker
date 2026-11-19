import { pluginOpener } from '../rules/proxies.mts';
import { collectionFetches } from './fetches.mts';
import { annotationIn, argumentOf, typeName } from '../spring-names.mts';
import { entriesOf, report } from '../spring-scopes.mts';
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
} from './data-types.mts';
import type {
  Annotated,
  Annotation,
  ClassFact,
  Declaration,
  Fqns,
  Member,
  Reported,
  RuleOptions,
  SpringView,
} from '../typed/spring-shapes.mts';

const LAZY = /\bLAZY\b/u;
const EAGER = /\bEAGER\b/u;
const SHARED_CASCADE = /\b(?:ALL|REMOVE)\b/u;
const BATCH_BREAKING_IDS = /\b(?:IDENTITY|TABLE)\b/u;

export function membersOf(view: SpringView, declared: ClassFact): Member[] {
  return [
    ...declared.primaryParameters.filter(({ property }) => property !== undefined),
    ...view
      .propertiesOf(declared.qualified)
      .filter(
        (member) =>
          member.computed === undefined && !member.delegated && member.abstract === undefined,
      ),
  ];
}

export function annotatedWith(
  view: SpringView,
  member: Declaration,
  fqns: Fqns,
): Annotation | undefined {
  return annotationIn(view.resolve, entriesOf(member), fqns);
}

function annotatedMembers(view: SpringView): { member: Annotated; owner: string }[] {
  return [
    ...view.file.classes.flatMap((declared) =>
      membersOf(view, declared).map((member) => ({ member, owner: declared.qualified })),
    ),
    ...view.file.functions.map((member) => ({ member, owner: member.owner })),
  ].filter(({ member }) => entriesOf(member).length > 0);
}

function mappingFindings(
  view: SpringView,
  { member, symbol }: { member: Annotated; symbol: string },
  { allowsSequenceIds }: RuleOptions,
): Reported[] {
  return entriesOf(member).flatMap((entry) => {
    const type = entry.type ?? entry.name;
    const fetch = argumentOf(entry, 'fetch') ?? '';
    const checks: [string, boolean][] = [
      ['JpaLazyFetching', view.is(type, TO_ONE) && !LAZY.test(fetch)],
      ['JpaLazyFetching', view.is(type, TO_MANY) && EAGER.test(fetch)],
      [
        'JpaManyToManyCascade',
        view.is(type, MANY_TO_MANY) && SHARED_CASCADE.test(argumentOf(entry, 'cascade') ?? ''),
      ],
      [
        'JpaSequenceIds',
        view.is(type, GENERATED_VALUE) &&
          allowsSequenceIds?.(view.file.file) !== false &&
          BATCH_BREAKING_IDS.test(argumentOf(entry, 'strategy') ?? ''),
      ],
    ];
    return checks.filter(([, flagged]) => flagged).map(([rule]) => report(rule, member, symbol));
  });
}

function mappings(view: SpringView, options: RuleOptions): Reported[] {
  return annotatedMembers(view).flatMap(({ member, owner }) =>
    mappingFindings(view, { member, symbol: `${owner}.${member.name}` }, options),
  );
}

function manyToManyLists(view: SpringView): Reported[] {
  return annotatedMembers(view)
    .filter(({ member }) => {
      const mapped = annotatedWith(view, member, MANY_TO_MANY);
      return mapped !== undefined && argumentOf(mapped, 'mappedBy') === undefined;
    })
    .filter(({ member }) => annotatedWith(view, member, ORDER_COLUMN) === undefined)
    .filter(({ member }) =>
      LIST_TYPES.has(
        typeName(member.type ?? member.initializer)
          .split('.')
          .at(-1) ?? '',
      ),
    )
    .map(({ member, owner }) => report('JpaManyToManySet', member, `${owner}.${member.name}`));
}

function entityClasses(view: SpringView, { allOpen }: RuleOptions): Reported[] {
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

function versioned(view: SpringView, declared: ClassFact): boolean {
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

function versions(view: SpringView): Reported[] {
  return view.file.classes
    .filter(
      (declared) => annotationIn(view.resolve, declared.annotations, ENTITY_CLASSES) !== undefined,
    )
    .filter((declared) => !versioned(view, declared))
    .map((declared) => report('JpaVersion', declared, declared.qualified));
}

export const ENTITY_RULES = [mappings, manyToManyLists, entityClasses, versions, collectionFetches];
