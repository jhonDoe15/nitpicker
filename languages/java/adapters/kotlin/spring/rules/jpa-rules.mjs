import {
  COLLECTION_ASSOCIATIONS,
  ENTITY,
  ENTITY_OR_SUPERCLASS,
  GENERATED_VALUE,
  IDENTIFIERS,
  IMMUTABLE,
  MANY_TO_MANY,
  ORDER_COLUMN,
  SINGLE_VALUED_ASSOCIATIONS,
  VERSION,
} from '../names/spring-annotations.mjs';
import { LIST_TYPES } from '../names/spring-body-types.mjs';
import {
  annotationOn,
  argumentMatches,
  classSymbolOf,
  defineRule,
  hasAnnotation,
  hitAt,
  hitOn,
  sitesOfType,
} from './rule-support.mjs';

const NON_ENTITY_MODIFIERS = ['data', 'final', 'value', 'inline'];
const NON_ENTITY_KINDS = new Set(['enum', 'object', 'interface']);

const lazyFetching = defineRule(
  'JpaLazyFetching',
  'Write fetch = FetchType.LAZY on every @ManyToOne and @OneToOne (they are eager by default) and never use EAGER; load what a query needs with join fetch.',
  (file) =>
    [
      ...sitesOfType(file, SINGLE_VALUED_ASSOCIATIONS).filter(
        ({ annotation }) => !argumentMatches(annotation, 'fetch', /\bLAZY\b/),
      ),
      ...sitesOfType(file, COLLECTION_ASSOCIATIONS).filter(({ annotation }) =>
        argumentMatches(annotation, 'fetch', /\bEAGER\b/),
      ),
    ].map(hitAt),
);

const entityClass = defineRule(
  'JpaEntityClass',
  'Make the entity a plain class that is open for proxies. Data classes, final classes, enums and objects cannot be JPA entities; use data classes for DTOs.',
  (file) =>
    sitesOfType(file, ENTITY)
      .filter((site) => site.kind === 'class')
      .filter(
        (site) =>
          NON_ENTITY_MODIFIERS.some((modifier) => site.decl.modifiers.has(modifier)) ||
          NON_ENTITY_KINDS.has(site.decl.kind),
      )
      .map(hitAt),
);

const manyToManyCascade = defineRule(
  'JpaManyToManyCascade',
  'Do not cascade ALL or REMOVE on @ManyToMany: removing one parent deletes rows that other parents still share.',
  (file) =>
    sitesOfType(file, MANY_TO_MANY)
      .filter(({ annotation }) => argumentMatches(annotation, 'cascade', /\b(?:ALL|REMOVE)\b/))
      .map(hitAt),
);

const manyToManySet = defineRule(
  'JpaManyToManySet',
  'Map @ManyToMany as a Set (or a List with @OrderColumn). A plain List makes Hibernate delete and re-insert every join row when one element is removed.',
  (file) =>
    sitesOfType(file, MANY_TO_MANY)
      .filter(
        (site) => site.kind === 'property' || (site.kind === 'parameter' && site.decl.property),
      )
      .filter((site) => !hasAnnotation(file, site.decl, ORDER_COLUMN))
      .filter(
        (site) =>
          site.decl.type !== undefined && file.resolver.matches(site.decl.type.name, LIST_TYPES),
      )
      .map((site) => hitOn(site.decl.node, site.symbol)),
);

function hasMember(file, declaration, names) {
  return [...declaration.properties, ...declaration.functions].some((member) =>
    hasAnnotation(file, member, names),
  );
}

function needsVersion(file, declaration, entity) {
  const superclassFree = !declaration.supertypes.some(({ called }) => called);
  const entityWithoutSuperclass = superclassFree && file.resolver.matches(entity.name, ENTITY);
  return (
    (entityWithoutSuperclass || hasMember(file, declaration, IDENTIFIERS)) &&
    !hasAnnotation(file, declaration, IMMUTABLE) &&
    !hasMember(file, declaration, VERSION)
  );
}

const versionField = defineRule(
  'JpaVersion',
  'Add a @Version property next to the @Id, so concurrent updates fail instead of overwriting each other. Mark entities that are never updated with @Immutable.',
  (file) =>
    file.classes.flatMap((declaration) => {
      const entity = annotationOn(file, declaration, ENTITY_OR_SUPERCLASS);
      return entity !== undefined && needsVersion(file, declaration, entity)
        ? [hitOn(entity.node, `${classSymbolOf(declaration)}@${entity.name}`)]
        : [];
    }),
);

const sequenceIds = defineRule(
  'JpaSequenceIds',
  'Generate ids with GenerationType.SEQUENCE (or UUID). IDENTITY and TABLE ids disable JDBC insert batching.',
  (file) =>
    sitesOfType(file, GENERATED_VALUE)
      .filter(({ annotation }) => argumentMatches(annotation, 'strategy', /\b(?:IDENTITY|TABLE)\b/))
      .map(hitAt),
);

export const JPA_RULES = [
  lazyFetching,
  entityClass,
  manyToManyCascade,
  manyToManySet,
  versionField,
  sequenceIds,
];
