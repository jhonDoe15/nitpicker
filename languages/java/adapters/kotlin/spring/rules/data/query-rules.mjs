import { argumentValue } from '../../syntax/kotlin-annotations.mjs';
import { descendants, kid, textOf } from '../../syntax/kotlin-tree.mjs';
import {
  JPA_QUERIES,
  JPA_QUERY,
  MODIFYING,
  NATIVE_QUERY,
  QUERY_ANNOTATIONS,
} from '../../names/spring-annotations.mjs';
import {
  defineRule,
  hitAt,
  hitOn,
  isTrueArgument,
  memberSymbolOf,
  sitesOfType,
} from '../rule-support.mjs';

const SUPPRESSIONS = /(?:^|\.)Suppress(?:Warnings)?$/;
const BASE_METHODS = new Set([
  'findById',
  'findAll',
  'findAllById',
  'findOne',
  'findBy',
  'count',
  'exists',
  'existsById',
  'save',
  'saveAll',
  'saveAndFlush',
  'saveAllAndFlush',
  'delete',
  'deleteById',
  'deleteAll',
  'deleteAllById',
  'deleteAllInBatch',
  'deleteAllByIdInBatch',
  'getReferenceById',
]);

function isSuppressed(site, rule) {
  const declarations = [];
  for (let current = site.decl; current !== undefined; current = current.parent ?? current.owner) {
    declarations.push(current);
  }
  return declarations
    .flatMap((declaration) => declaration.annotations)
    .filter((annotation) => SUPPRESSIONS.test(annotation.name))
    .some((annotation) => annotation.args.some(({ text }) => text.includes(`"PMD.${rule}"`)));
}

const derivedQuery = defineRule(
  'SpringDataDerivedQuery',
  'Write this repository function with @Query (JPQL in a raw string for JPA), naming the entity and every condition, instead of a query derived from the function name.',
  (file, project) =>
    file.classes
      .filter((declaration) => declaration.kind === 'interface')
      .filter((declaration) =>
        declaration.supertypes.some(({ type }) =>
          file.resolver.matches(type.name, project.repositoryTypes),
        ),
      )
      .flatMap((declaration) => declaration.functions)
      .filter((member) => member.body === undefined && !BASE_METHODS.has(member.name))
      .filter(
        (member) =>
          !member.annotations.some((annotation) =>
            file.resolver.matches(annotation.name, QUERY_ANNOTATIONS),
          ),
      )
      .map((member) => hitOn(member.node, memberSymbolOf(member))),
);

const nativeQuery = defineRule(
  'SpringDataNativeQuery',
  'Write the query in JPQL; native SQL is not checked at startup. If this one needs SQL, mark this function with @Suppress("PMD.SpringDataNativeQuery"), the only inline suppression nitpicker accepts.',
  (file) =>
    [
      ...sitesOfType(file, NATIVE_QUERY),
      ...sitesOfType(file, JPA_QUERY).filter(({ annotation }) =>
        isTrueArgument(annotation, 'nativeQuery'),
      ),
    ]
      .filter((site) => !isSuppressed(site, 'SpringDataNativeQuery'))
      .map(hitAt),
);

const modifyingQuery = defineRule(
  'SpringDataModifyingQuery',
  'Write @Modifying(clearAutomatically = true, flushAutomatically = true), so pending changes are flushed first and no stale entities stay in the persistence context.',
  (file) =>
    sitesOfType(file, MODIFYING)
      .filter(
        ({ annotation }) =>
          !isTrueArgument(annotation, 'clearAutomatically') ||
          !isTrueArgument(annotation, 'flushAutomatically'),
      )
      .map(hitAt),
);

const namedParameters = defineRule(
  'SpringDataNamedParameters',
  'Bind query parameters by name (:email), not by position (?1); positions break silently when parameters are reordered.',
  (file) =>
    sitesOfType(file, JPA_QUERIES)
      .filter((site) =>
        descendants(site.annotation.node, (node) => node.t === 'STRING_TEMPLATE').some((node) =>
          /\?[0-9]/.test(textOf(file.source, node)),
        ),
      )
      .map(hitAt),
);

function joinsStrings(file, annotation) {
  return ['value', 'countQuery'].some((name) => {
    const node = argumentValue(annotation, name)?.node;
    return (
      node?.t === 'BINARY_EXPRESSION' &&
      textOf(file.source, kid(node, 'OPERATION_REFERENCE')) === '+'
    );
  });
}

const queryRawString = defineRule(
  'SpringDataQueryTextBlock',
  'Write a multi-part query as one raw string (""") with trimIndent() instead of joining strings with +.',
  (file) =>
    sitesOfType(file, JPA_QUERIES)
      .filter(({ annotation }) => joinsStrings(file, annotation))
      .map(hitAt),
);

export const QUERY_RULES = [
  derivedQuery,
  nativeQuery,
  modifyingQuery,
  namedParameters,
  queryRawString,
];
