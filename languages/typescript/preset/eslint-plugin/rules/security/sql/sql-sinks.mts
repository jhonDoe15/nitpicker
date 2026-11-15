import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, resolveConstant } from '../../analysis/constant-resolution.mts';
import { ancestorsOf, chainOf } from '../../typed/node-views.mts';
import {
  isTypeWrapper,
  leafValues,
  memberName,
  typeServices,
  unwrapped,
  type Context,
} from '../security-values.mts';

export type Sink = 'raw' | 'clause' | 'order' | 'query';

const QUERY_PREFIX = '\\$?(?:query|execute|exec|raw|run|all|get|each|prepare|unsafe|batch)\\w*';
const PG_PROMISE = 'none|one|many|any|oneOrNone|manyOrNone|result|multi|multiResult';
const SQL_CALL_NAME = new RegExp(
  `^(?:${QUERY_PREFIX}|\\w*(?:query|sql|execute)\\w*|${PG_PROMISE})$`,
  'iu',
);
const RAW_METHODS = new Set<string | undefined>([
  'whereRaw',
  'orWhereRaw',
  'andWhereRaw',
  'whereNotRaw',
  'havingRaw',
  'orHavingRaw',
  'orderByRaw',
  'groupByRaw',
  'joinRaw',
  'fromRaw',
  'onRaw',
]);
const RAW_OWNER = /^(?:sql|knex)$/iu;
const LITERAL_OWNER = /sequelize/iu;
const CLAUSE_METHODS = new Set<string | undefined>([
  'where',
  'andWhere',
  'orWhere',
  'having',
  'andHaving',
  'orHaving',
]);
const ORDER_METHODS = new Set<string | undefined>([
  'orderBy',
  'addOrderBy',
  'groupBy',
  'addGroupBy',
]);
const BUILDER_NAME = /^(?:qb|\w*(?:QueryBuilder|queryBuilder|Qb))$/u;
const BUILDER_TYPE = /QueryBuilder$/u;
const WRAPPERS = new Set<string>([
  AST_NODE_TYPES.Property,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.AwaitExpression,
]);

function calleeName(context: Context, callee: TSESTree.Node): string | undefined {
  const target = unwrapped(callee);
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return memberName(target);
  }
  if (target.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const alias = leafValues(context, target).find(
    (leaf) => leaf.type === AST_NODE_TYPES.MemberExpression,
  );
  return alias === undefined ? target.name : memberName(alias);
}

function ownerName(callee: TSESTree.MemberExpression): string | undefined {
  const owner = unwrapped(callee.object);
  if (owner.type === AST_NODE_TYPES.Identifier) {
    return owner.name;
  }
  return owner.type === AST_NODE_TYPES.MemberExpression ? memberName(owner) : undefined;
}

function hasBuilderType(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const symbol = services.getTypeAtLocation(node).getSymbol();
  return symbol !== undefined && BUILDER_TYPE.test(symbol.getName());
}

function builderStep(context: Context, node: TSESTree.Node): TSESTree.Node | undefined {
  const callee = node.type === AST_NODE_TYPES.CallExpression ? unwrapped(node.callee) : undefined;
  return callee?.type === AST_NODE_TYPES.MemberExpression &&
    memberName(callee) !== 'createQueryBuilder'
    ? unwrapped(resolveConstant(context, unwrapped(callee.object)))
    : undefined;
}

function isQueryBuilder(context: Context, node: TSESTree.Node): boolean {
  const start = unwrapped(resolveConstant(context, unwrapped(node)));
  const last = chainOf(start, (current) => builderStep(context, current)).at(-1);
  if (last === undefined) {
    return false;
  }
  if (last.type === AST_NODE_TYPES.Identifier) {
    return BUILDER_NAME.test(last.name) || hasBuilderType(context, last);
  }
  const callee = last.type === AST_NODE_TYPES.CallExpression ? unwrapped(last.callee) : undefined;
  const created =
    callee?.type === AST_NODE_TYPES.MemberExpression && memberName(callee) === 'createQueryBuilder';
  return created || hasBuilderType(context, last);
}

function builderSink(
  context: Context,
  callee: TSESTree.MemberExpression,
  name: string | undefined,
): Sink | undefined {
  if (RAW_METHODS.has(name)) {
    return 'raw';
  }
  const owner = ownerName(callee);
  if (
    (name === 'raw' && RAW_OWNER.test(owner ?? '')) ||
    (name === 'literal' && LITERAL_OWNER.test(owner ?? ''))
  ) {
    return 'raw';
  }
  const builder =
    (CLAUSE_METHODS.has(name) || ORDER_METHODS.has(name)) && isQueryBuilder(context, callee.object);
  if (!builder) {
    return undefined;
  }
  return CLAUSE_METHODS.has(name) ? 'clause' : 'order';
}

function sinkOf(
  context: Context,
  call: TSESTree.CallExpression,
  argument: TSESTree.Node | undefined,
): Sink | undefined {
  const callee = unwrapped(call.callee);
  const name = calleeName(context, callee);
  const first = call.arguments[0] === argument;
  const builder =
    first && callee.type === AST_NODE_TYPES.MemberExpression
      ? builderSink(context, callee, name)
      : undefined;
  return builder ?? (name !== undefined && SQL_CALL_NAME.test(name) ? 'query' : undefined);
}

function consumingSink(context: Context, node: TSESTree.Node): Sink | undefined {
  const owners = ancestorsOf(node);
  const index = owners.findIndex((owner) => !(WRAPPERS.has(owner.type) || isTypeWrapper(owner)));
  const call = owners[index];
  const argument = index === 0 ? node : owners[index - 1];
  return call?.type === AST_NODE_TYPES.CallExpression && call.callee !== argument
    ? sinkOf(context, call, argument)
    : undefined;
}

function assignedTarget(node: TSESTree.Node): TSESTree.Node | undefined {
  const holder = node.parent;
  if (holder?.type === AST_NODE_TYPES.VariableDeclarator && holder.init === node) {
    return holder.id;
  }
  return holder?.type === AST_NODE_TYPES.AssignmentExpression && holder.right === node
    ? holder.left
    : undefined;
}

export function variableSink(
  context: Context,
  variable: TSESLint.Scope.Variable | undefined,
): Sink | undefined {
  const sinks = (variable?.references ?? [])
    .filter((reference) => reference.isRead())
    .map((reference) => consumingSink(context, reference.identifier))
    .filter((sink) => sink !== undefined);
  return sinks.find((sink) => sink !== 'query') ?? sinks[0];
}

export function sinkFor(context: Context, node: TSESTree.Node): Sink | undefined {
  const target = assignedTarget(node);
  const variable =
    target?.type === AST_NODE_TYPES.Identifier
      ? findVariable(context, target, target.name)
      : undefined;
  return consumingSink(context, node) ?? variableSink(context, variable);
}
