import { chainOf } from '../analysis/ancestry.mjs';
import { isFunctionNode } from '../analysis/constant-resolution.mjs';
import { DRIZZLE, moduleScope } from '../database/orm-modules.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';

const LIST_QUERIES = new Set(['find', 'findBy', 'findByIds', 'findMany', 'findAll', 'getMany']);
const PRISMA_PACKAGE = '@prisma/';
const PRISMA_NAME = /prisma/iu;
const DRIZZLE_FROM = 'from';
const DRIZZLE_SELECTS = new Set(['select', 'selectDistinct']);
const DRIZZLE_GROUPING = 'groupBy';

function isPrismaSource({ source }) {
  return typeof source === 'string' && source.startsWith(PRISMA_PACKAGE);
}

export function queryScope(context) {
  const scope = moduleScope(context);
  const prisma = [...scope.bindings.values()].some(isPrismaSource);
  return { context, families: scope.families, orm: scope.families.size > 0 || prisma };
}

function callChain(node) {
  return chainOf(unwrapped(node), (current) =>
    current.type === 'CallExpression' && current.callee.type === 'MemberExpression'
      ? unwrapped(current.callee.object)
      : undefined,
  ).filter((current) => current.type === 'CallExpression');
}

function isAggregateSelect(call) {
  const [shape] = call.arguments;
  return (
    shape?.type === 'ObjectExpression' &&
    shape.properties.some(
      (property) =>
        property.type === 'Property' && unwrapped(property.value).type === 'CallExpression',
    )
  );
}

function namesOf(call) {
  return callChain(call).map((current) =>
    current.callee.type === 'MemberExpression' ? memberName(current.callee) : undefined,
  );
}

function isDrizzleSelect(scope, call) {
  if (!scope.families.has(DRIZZLE)) {
    return false;
  }
  const calls = callChain(call);
  const names = namesOf(call);
  const from = names.indexOf(DRIZZLE_FROM);
  const select = from === -1 ? undefined : calls[from + 1];
  return (
    select !== undefined &&
    DRIZZLE_SELECTS.has(names[from + 1]) &&
    !isAggregateSelect(select) &&
    !names.includes(DRIZZLE_GROUPING)
  );
}

function mentionsPrisma(scope, call) {
  return PRISMA_NAME.test(scope.context.sourceCode.getText(call.callee.object));
}

function isListQuery(scope, call) {
  const name = memberName(call.callee);
  return LIST_QUERIES.has(name) && (scope.orm || mentionsPrisma(scope, call));
}

export function isQueryResult(scope, node) {
  const awaited = unwrapped(node);
  const call = awaited?.type === 'AwaitExpression' ? unwrapped(awaited.argument) : undefined;
  if (call?.type !== 'CallExpression' || call.callee.type !== 'MemberExpression') {
    return false;
  }
  if (call.arguments.some((argument) => isFunctionNode(unwrapped(argument)))) {
    return false;
  }
  return isListQuery(scope, call) || isDrizzleSelect(scope, call);
}
