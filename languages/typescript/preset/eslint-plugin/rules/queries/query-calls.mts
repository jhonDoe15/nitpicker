import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, stringValue } from '../analysis/constant-resolution.mts';
import { DRIZZLE, moduleScope, type OrmBinding } from '../database/orm-modules.mts';
import { memberName, staticKey, unwrapped, type Context } from '../security/security-values.mts';
import { type MemberCall } from '../events/emitter-creations.mts';
import { chainOf } from '../typed/node-views.mts';
import { isCallExpression } from '../typed/syntax-views.mts';

export type QueryScope = {
  readonly context: Context;
  readonly families: Set<string>;
  readonly orm: boolean;
};

const LIST_QUERIES = new Set<string | undefined>([
  'find',
  'findBy',
  'findByIds',
  'findMany',
  'findAll',
  'getMany',
]);
const PRISMA_PACKAGE = '@prisma/';
const PRISMA_NAME = /^prisma(?:service|client)?$/iu;
const DRIZZLE_FROM = 'from';
const DRIZZLE_SELECTS = new Set<string | undefined>(['select', 'selectDistinct']);
const DRIZZLE_GROUPING = 'groupBy';
const PAGES = new Set<string | undefined>(['take', 'skip', 'limit', 'offset', 'cursor']);
const RECEIVER_WORDS = /repo|manager|model|prisma|orm|entit/iu;
const RECEIVER_NAMES = new Set(['em', 'db', 'tx', 'trx', 'query']);
const MODEL_NAME = /^[A-Z]/u;

function isPrismaSource({ source }: OrmBinding): boolean {
  return source.startsWith(PRISMA_PACKAGE);
}

export function queryScope(context: Context): QueryScope {
  const scope = moduleScope(context);
  const prisma = [...scope.bindings.values()].some(isPrismaSource);
  return { context, families: scope.families, orm: scope.families.size > 0 || prisma };
}

function isMemberCall(node: TSESTree.Node): node is MemberCall {
  return isCallExpression(node) && node.callee.type === AST_NODE_TYPES.MemberExpression;
}

export function callChain(node: TSESTree.Node): TSESTree.CallExpression[] {
  return chainOf<TSESTree.Node>(unwrapped(node), (current) =>
    isMemberCall(current) ? unwrapped(current.callee.object) : undefined,
  ).filter(isCallExpression);
}

function isAggregateSelect(call: TSESTree.CallExpression): boolean {
  const [shape] = call.arguments;
  return (
    shape?.type === AST_NODE_TYPES.ObjectExpression &&
    shape.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        unwrapped(property.value).type === AST_NODE_TYPES.CallExpression,
    )
  );
}

function namesOf(call: TSESTree.CallExpression): (string | undefined)[] {
  return callChain(call).map((current) =>
    current.callee.type === AST_NODE_TYPES.MemberExpression
      ? memberName(current.callee)
      : undefined,
  );
}

function isDrizzleSelect(scope: QueryScope, call: TSESTree.CallExpression): boolean {
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

function memberNameOf(step: TSESTree.Node): string | undefined {
  return step.type === AST_NODE_TYPES.MemberExpression ? memberName(step) : undefined;
}

export function receiverNames(receiver: TSESTree.Node): string[] {
  const steps = chainOf<TSESTree.Node>(unwrapped(receiver), (current) => {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      return unwrapped(current.callee);
    }
    return current.type === AST_NODE_TYPES.MemberExpression ? unwrapped(current.object) : undefined;
  });
  return steps
    .map((step) => (step.type === AST_NODE_TYPES.Identifier ? step.name : memberNameOf(step)))
    .filter((name): name is string => name !== undefined);
}

export function isRepositoryLike(names: readonly string[]): boolean {
  const [last] = names;
  return (
    (last !== undefined && MODEL_NAME.test(last)) ||
    names.some((name) => RECEIVER_NAMES.has(name) || RECEIVER_WORDS.test(name))
  );
}

function isPaged(call: TSESTree.CallExpression): boolean {
  const keys = call.arguments.flatMap((argument) => {
    const options = unwrapped(argument);
    return options.type === AST_NODE_TYPES.ObjectExpression
      ? options.properties.map(staticKey)
      : [];
  });
  return keys.some((key) => PAGES.has(key)) || namesOf(call).some((name) => PAGES.has(name));
}

export function isOrmCall(
  scope: QueryScope,
  call: MemberCall,
  methods: ReadonlySet<string | undefined> = LIST_QUERIES,
): boolean {
  const names = receiverNames(call.callee.object);
  const prisma = names.some((name) => PRISMA_NAME.test(name));
  const textual = stringValue(unwrapped(call.arguments[0])) !== undefined;
  return (
    methods.has(memberName(call.callee)) &&
    !textual &&
    (scope.orm || prisma) &&
    isRepositoryLike(names)
  );
}

export function isQueryResult(scope: QueryScope, node: TSESTree.Node): boolean {
  const awaited = unwrapped(node);
  const call =
    awaited.type === AST_NODE_TYPES.AwaitExpression ? unwrapped(awaited.argument) : undefined;
  if (call === undefined || !isMemberCall(call)) {
    return false;
  }
  if (call.arguments.some((argument) => isFunctionNode(unwrapped(argument))) || isPaged(call)) {
    return false;
  }
  return isOrmCall(scope, call) || isDrizzleSelect(scope, call);
}
