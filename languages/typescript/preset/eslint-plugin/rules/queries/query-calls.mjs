import { chainOf } from '../analysis/ancestry.mjs';
import { isFunctionNode, stringValue } from '../analysis/constant-resolution.mjs';
import { DRIZZLE, moduleScope } from '../database/orm-modules.mjs';
import { memberName, staticKey, unwrapped } from '../security/security-values.mjs';

const LIST_QUERIES = new Set(['find', 'findBy', 'findByIds', 'findMany', 'findAll', 'getMany']);
const PRISMA_PACKAGE = '@prisma/';
const PRISMA_NAME = /^prisma(?:service|client)?$/iu;
const DRIZZLE_FROM = 'from';
const DRIZZLE_SELECTS = new Set(['select', 'selectDistinct']);
const DRIZZLE_GROUPING = 'groupBy';
const PAGES = new Set(['take', 'skip', 'limit', 'offset', 'cursor']);
const RECEIVER_WORDS = /repo|manager|model|prisma|orm|entit/iu;
const RECEIVER_NAMES = new Set(['em', 'db', 'tx', 'trx', 'query']);
const MODEL_NAME = /^[A-Z]/u;

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

function memberNameOf(step) {
  return step.type === 'MemberExpression' ? memberName(step) : undefined;
}

function receiverNames(receiver) {
  const steps = chainOf(unwrapped(receiver), (current) => {
    if (current.type === 'CallExpression') {
      return unwrapped(current.callee);
    }
    return current.type === 'MemberExpression' ? unwrapped(current.object) : undefined;
  });
  return steps
    .map((step) => (step.type === 'Identifier' ? step.name : memberNameOf(step)))
    .filter((name) => name !== undefined);
}

function isRepositoryLike(names) {
  const [last] = names;
  return (
    (last !== undefined && MODEL_NAME.test(last)) ||
    names.some((name) => RECEIVER_NAMES.has(name) || RECEIVER_WORDS.test(name))
  );
}

function isPaged(call) {
  const options = call.arguments.filter(
    (argument) => unwrapped(argument).type === 'ObjectExpression',
  );
  const keys = options.flatMap((argument) => unwrapped(argument).properties.map(staticKey));
  return keys.some((key) => PAGES.has(key)) || namesOf(call).some((name) => PAGES.has(name));
}

function isListQuery(scope, call) {
  const names = receiverNames(call.callee.object);
  const prisma = names.some((name) => PRISMA_NAME.test(name));
  const textual = stringValue(unwrapped(call.arguments[0])) !== undefined;
  return (
    LIST_QUERIES.has(memberName(call.callee)) &&
    !textual &&
    (scope.orm || prisma) &&
    isRepositoryLike(names)
  );
}

export function isQueryResult(scope, node) {
  const awaited = unwrapped(node);
  const call = awaited?.type === 'AwaitExpression' ? unwrapped(awaited.argument) : undefined;
  if (call?.type !== 'CallExpression' || call.callee.type !== 'MemberExpression') {
    return false;
  }
  if (call.arguments.some((argument) => isFunctionNode(unwrapped(argument))) || isPaged(call)) {
    return false;
  }
  return isListQuery(scope, call) || isDrizzleSelect(scope, call);
}
