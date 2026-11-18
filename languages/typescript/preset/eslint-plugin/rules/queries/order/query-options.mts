import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, staticKey, unwrapped } from '../../security/security-values.mts';
import { QUERY_BUILDER, type ChainScope } from '../chains/chain-libraries.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

type MaybeNode = TSESTree.Node | undefined;

const PAGE_KEYS = new Set(['take', 'skip', 'cursor', 'limit', 'offset']);
const ORDER_KEYS = new Set(['orderBy', 'order']);
const NESTED_KEYS = new Set<string | undefined>(['include', 'select', 'with']);
const MAX_NESTING = 3;
const ANY_LIBRARY = new Set<string | undefined>(['findMany']);
const ORM_FINDERS = new Set<string | undefined>([
  'find',
  'findAndCount',
  'findAll',
  'findAndCountAll',
]);
const ORM_MODULES =
  /^(?:typeorm|@nestjs\/typeorm|sequelize|sequelize-typescript|@sequelize\/core|@nestjs\/sequelize|@mikro-orm\/.+)$/u;

function isObject(node: MaybeNode): node is TSESTree.ObjectExpression {
  return node?.type === AST_NODE_TYPES.ObjectExpression;
}

function properties(object: TSESTree.ObjectExpression): TSESTree.Property[] {
  return object.properties.filter(
    (property): property is TSESTree.Property => property.type === AST_NODE_TYPES.Property,
  );
}

function keyed(object: TSESTree.ObjectExpression): Map<string, TSESTree.Property> {
  const entries = properties(object).flatMap((property) => {
    const key = staticKey(property);
    return key === undefined ? [] : [[key, property] as const];
  });
  return new Map(entries);
}

function hasSpread(object: TSESTree.ObjectExpression): boolean {
  return object.properties.some((property) => property.type !== AST_NODE_TYPES.Property);
}

function unorderedPage(object: TSESTree.ObjectExpression): TSESTree.Property | undefined {
  if (hasSpread(object)) {
    return undefined;
  }
  const entries = keyed(object);
  const page = [...entries.keys()].find((key) => PAGE_KEYS.has(key));
  const ordered = [...entries.keys()].some((key) => ORDER_KEYS.has(key));
  return page === undefined || ordered ? undefined : entries.get(page);
}

function nestedObjects(object: TSESTree.ObjectExpression): TSESTree.ObjectExpression[] {
  return properties(object)
    .filter((property) => NESTED_KEYS.has(staticKey(property)))
    .map((property) => unwrapped(property.value))
    .filter(isObject)
    .flatMap((value) => properties(value).map((relation) => unwrapped(relation.value)))
    .filter(isObject);
}

function relationPages(object: TSESTree.ObjectExpression): TSESTree.Property[] {
  const pending = nestedObjects(object).map((relation) => ({ relation, depth: 0 }));
  const pages: TSESTree.Property[] = [];
  for (const { relation, depth } of pending) {
    const page = unorderedPage(relation);
    if (page !== undefined) {
      pages.push(page);
    }
    if (depth < MAX_NESTING) {
      appendAll(
        pending,
        nestedObjects(relation).map((child) => ({ relation: child, depth: depth + 1 })),
      );
    }
  }
  return pages;
}

function usesOrm(scope: ChainScope): boolean {
  return (
    [...scope.bindings.values()].some(({ source }) => ORM_MODULES.test(source)) ||
    scope.libraries.has(QUERY_BUILDER)
  );
}

function finderName(call: TSESTree.CallExpression): string | undefined {
  const callee = unwrapped(call.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
}

/** The page keys of a find call's options that have no order key beside them. */
export function unorderedOptionPages(
  scope: ChainScope,
  call: TSESTree.CallExpression,
): TSESTree.Property[] {
  const name = finderName(call);
  const topLevel = ANY_LIBRARY.has(name) || (ORM_FINDERS.has(name) && usesOrm(scope));
  const isFinder = topLevel || name?.startsWith('find') === true;
  if (!isFinder) {
    return [];
  }
  const objects = call.arguments.map((argument) => unwrapped(argument)).filter(isObject);
  return objects.flatMap((object) => {
    const page = topLevel ? unorderedPage(object) : undefined;
    return [...(page === undefined ? [] : [page]), ...relationPages(object)];
  });
}
