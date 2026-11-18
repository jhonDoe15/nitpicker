import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { staticKey } from '../../security/security-values.mts';
import { calleeNameOf } from '../../typed/syntax-views.mts';

type Node = TSESTree.Node;
export type Site = { readonly value: Node; readonly operator: string };

const PRISMA_METHODS = new Set<string>([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'deleteMany',
  'updateMany',
  'aggregate',
  'groupBy',
]);
const PRISMA_OPERATORS = new Set<string>(['contains', 'startsWith', 'endsWith']);
const EXACT_OPERATORS = new Set<string>(['equals', 'not']);
const LIKE_KEYS = new Set<string>(['$like', '$ilike', '$notLike', '$notILike', '$regex']);
const SEQUELIZE_OPERATORS = new Set<string>(['like', 'iLike', 'notLike', 'notILike']);
const LIKE_FUNCTIONS = new Set<string>(['like', 'ilike', 'notLike', 'notIlike']);
const LIKE_WRAPPERS = new Set<string>(['Like', 'ILike']);
const WHERE_LIKE_METHODS = new Set<string>([
  'whereLike',
  'whereILike',
  'orWhereLike',
  'orWhereILike',
]);
const WHERE_METHODS = new Set<string>(['where', 'andWhere', 'orWhere', 'having']);
const LIKE_COMPARATORS = new Set<string>(['like', 'ilike', 'not like', 'not ilike']);
const SQL_TAGS = new Set<string>(['sql', '$queryRaw', '$executeRaw']);
const LIKE_OPERAND = /\b(?:not\s+)?i?like\s*$/iu;
const MAX_LEVELS = 8;

function keyOf(node: Node): string | undefined {
  if (node.type !== AST_NODE_TYPES.Property) {
    return undefined;
  }
  if (node.computed && node.key.type === AST_NODE_TYPES.MemberExpression) {
    const { object, property } = node.key;
    return object.type === AST_NODE_TYPES.Identifier &&
      object.name === 'Op' &&
      property.type === AST_NODE_TYPES.Identifier
      ? `Op.${property.name}`
      : undefined;
  }
  return staticKey(node);
}

function prismaCallAbove(node: Node): boolean {
  let current: Node = node;
  let whereSeen = false;
  for (let level = 0; level < MAX_LEVELS && current.parent != null; level += 1) {
    const holder: Node = current.parent;
    whereSeen = whereSeen || keyOf(holder) === 'where';
    if (holder.type === AST_NODE_TYPES.CallExpression) {
      return whereSeen && PRISMA_METHODS.has(calleeNameOf(holder.callee) ?? '');
    }
    current = holder;
  }
  return false;
}

function isInsensitive(object: TSESTree.ObjectExpression): boolean {
  return object.properties.some(
    (property) =>
      keyOf(property) === 'mode' &&
      'value' in property &&
      stringValue(property.value) === 'insensitive',
  );
}

function propertySite(property: TSESTree.Property): Site | undefined {
  const key = keyOf(property);
  const owner = property.parent;
  if (key === undefined || owner.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const prisma =
    (PRISMA_OPERATORS.has(key) || (EXACT_OPERATORS.has(key) && isInsensitive(owner))) &&
    prismaCallAbove(owner);
  const named =
    LIKE_KEYS.has(key) ||
    (key.startsWith('Op.') && SEQUELIZE_OPERATORS.has(key.slice('Op.'.length)));
  return prisma || named ? { value: property.value, operator: key } : undefined;
}

function templateSites(node: TSESTree.TaggedTemplateExpression): Site[] {
  const tag = calleeNameOf(node.tag) ?? '';
  if (!SQL_TAGS.has(tag)) {
    return [];
  }
  return node.quasi.expressions.flatMap((value, index) => {
    const text = node.quasi.quasis[index]?.value.cooked ?? '';
    return LIKE_OPERAND.test(text) ? [{ value, operator: 'LIKE' }] : [];
  });
}

function callSites(node: TSESTree.CallExpression): Site[] {
  const name = calleeNameOf(node.callee) ?? '';
  const [first, second, third] = node.arguments;
  const member = node.callee.type === AST_NODE_TYPES.MemberExpression;
  if (member && WHERE_LIKE_METHODS.has(name) && second !== undefined) {
    return [{ value: second, operator: name }];
  }
  if (member && WHERE_METHODS.has(name) && third !== undefined) {
    const comparator = stringValue(second)?.toLowerCase();
    return comparator !== undefined && LIKE_COMPARATORS.has(comparator)
      ? [{ value: third, operator: comparator.toUpperCase() }]
      : [];
  }
  if (!member && LIKE_FUNCTIONS.has(name) && node.arguments.length === 2 && second !== undefined) {
    return [{ value: second, operator: name }];
  }
  return !member && LIKE_WRAPPERS.has(name) && node.arguments.length === 1 && first !== undefined
    ? [{ value: first, operator: name }]
    : [];
}

export const filterSites = { callSites, propertySite, templateSites };
