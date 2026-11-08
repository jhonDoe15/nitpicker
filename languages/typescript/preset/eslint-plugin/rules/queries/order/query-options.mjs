import { memberName, staticKey, unwrapped } from '../../security/security-values.mjs';
import { QUERY_BUILDER } from '../query-chains.mjs';

const PAGE_KEYS = new Set(['take', 'skip', 'cursor', 'limit', 'offset']);
const ORDER_KEYS = new Set(['orderBy', 'order']);
const NESTED_KEYS = new Set(['include', 'select', 'with']);
const MAX_NESTING = 3;
const ANY_LIBRARY = new Set(['findMany']);
const ORM_FINDERS = new Set(['find', 'findAndCount', 'findAll', 'findAndCountAll']);
const ORM_MODULES =
  /^(?:typeorm|@nestjs\/typeorm|sequelize|sequelize-typescript|@sequelize\/core|@nestjs\/sequelize|@mikro-orm\/.+)$/u;

function properties(object) {
  return object.properties.filter((property) => property.type === 'Property');
}

function keyed(object) {
  const entries = properties(object).map((property) => [staticKey(property), property]);
  return new Map(entries.filter(([key]) => key !== undefined));
}

function hasSpread(object) {
  return object.properties.some((property) => property.type !== 'Property');
}

function unorderedPage(object) {
  if (hasSpread(object)) {
    return undefined;
  }
  const entries = keyed(object);
  const page = [...entries.keys()].find((key) => PAGE_KEYS.has(key));
  const ordered = [...entries.keys()].some((key) => ORDER_KEYS.has(key));
  return page === undefined || ordered ? undefined : entries.get(page);
}

function nestedObjects(object) {
  return properties(object)
    .filter((property) => NESTED_KEYS.has(staticKey(property)))
    .map((property) => unwrapped(property.value))
    .filter((value) => value?.type === 'ObjectExpression')
    .flatMap((value) => properties(value).map((relation) => unwrapped(relation.value)))
    .filter((value) => value?.type === 'ObjectExpression');
}

function relationPages(object) {
  const pending = nestedObjects(object).map((relation) => ({ relation, depth: 0 }));
  const pages = [];
  for (const { relation, depth } of pending) {
    const page = unorderedPage(relation);
    if (page !== undefined) {
      pages.push(page);
    }
    if (depth < MAX_NESTING) {
      pending.push(
        ...nestedObjects(relation).map((child) => ({ relation: child, depth: depth + 1 })),
      );
    }
  }
  return pages;
}

function usesOrm(scope) {
  return (
    [...scope.bindings.values()].some(({ source }) => ORM_MODULES.test(source)) ||
    scope.libraries.has(QUERY_BUILDER)
  );
}

function finderName(call) {
  const callee = unwrapped(call.callee);
  return callee.type === 'MemberExpression' ? memberName(callee) : undefined;
}

/** The page keys of a find call's options that have no order key beside them. */
export function unorderedOptionPages(scope, call) {
  const name = finderName(call);
  const topLevel = ANY_LIBRARY.has(name) || (ORM_FINDERS.has(name) && usesOrm(scope));
  const isFinder = topLevel || name?.startsWith('find') === true;
  if (!isFinder) {
    return [];
  }
  const objects = call.arguments
    .map((argument) => unwrapped(argument))
    .filter((value) => value?.type === 'ObjectExpression');
  return objects.flatMap((object) => {
    const page = topLevel ? unorderedPage(object) : undefined;
    return [...(page === undefined ? [] : [page]), ...relationPages(object)];
  });
}
