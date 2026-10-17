import { ancestorsOf, chainOf } from '../../analysis/ancestry.mjs';
import { findVariable, resolveConstant } from '../../analysis/constant-resolution.mjs';
import { leafValues, memberName, TYPE_WRAPPERS, unwrapped } from '../security-values.mjs';

const SQL_CALL_NAME =
  /^(?:\$?(?:query|execute|exec|raw|run|all|get|each|prepare|unsafe|batch)\w*|\w*(?:query|sql|execute)\w*|none|one|many|any|oneOrNone|manyOrNone|result|multi|multiResult)$/iu;
const RAW_METHODS = new Set([
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
const CLAUSE_METHODS = new Set(['where', 'andWhere', 'orWhere', 'having', 'andHaving', 'orHaving']);
const ORDER_METHODS = new Set(['orderBy', 'addOrderBy', 'groupBy', 'addGroupBy']);
const BUILDER_NAME = /^(?:qb|\w*(?:QueryBuilder|queryBuilder|Qb))$/u;
const BUILDER_TYPE = /QueryBuilder$/u;
const WRAPPERS = new Set([
  'Property',
  'ObjectExpression',
  'ArrayExpression',
  'AwaitExpression',
  ...TYPE_WRAPPERS,
]);

function calleeName(context, callee) {
  const target = unwrapped(callee);
  if (target.type === 'MemberExpression') {
    return memberName(target);
  }
  if (target.type !== 'Identifier') {
    return undefined;
  }
  const alias = leafValues(context, target).find((leaf) => leaf.type === 'MemberExpression');
  return alias === undefined ? target.name : memberName(alias);
}

function ownerName(callee) {
  const owner = unwrapped(callee.object);
  if (owner.type === 'Identifier') {
    return owner.name;
  }
  return owner.type === 'MemberExpression' ? memberName(owner) : undefined;
}

function hasBuilderType(context, node) {
  const services = context.sourceCode.parserServices;
  if (services?.program === undefined || services.program === null) {
    return false;
  }
  const symbol = services.getTypeAtLocation(node).getSymbol();
  return symbol !== undefined && BUILDER_TYPE.test(symbol.getName());
}

function builderStep(context, node) {
  const callee = node.type === 'CallExpression' ? unwrapped(node.callee) : undefined;
  const steps = callee?.type === 'MemberExpression' && memberName(callee) !== 'createQueryBuilder';
  return steps ? unwrapped(resolveConstant(context, unwrapped(callee.object))) : undefined;
}

function isQueryBuilder(context, node) {
  const start = unwrapped(resolveConstant(context, unwrapped(node)));
  const last = chainOf(start, (current) => builderStep(context, current)).at(-1);
  if (last.type === 'Identifier') {
    return BUILDER_NAME.test(last.name) || hasBuilderType(context, last);
  }
  const callee = last.type === 'CallExpression' ? unwrapped(last.callee) : undefined;
  const created =
    callee?.type === 'MemberExpression' && memberName(callee) === 'createQueryBuilder';
  return created || hasBuilderType(context, last);
}

function builderSink(context, callee, name) {
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

function sinkOf(context, call, argument) {
  const callee = unwrapped(call.callee);
  const name = calleeName(context, callee);
  const first = call.arguments[0] === argument;
  const builder =
    first && callee.type === 'MemberExpression' ? builderSink(context, callee, name) : undefined;
  return builder ?? (name !== undefined && SQL_CALL_NAME.test(name) ? 'query' : undefined);
}

export function consumingSink(context, node) {
  const owners = ancestorsOf(node);
  const index = owners.findIndex((owner) => !WRAPPERS.has(owner.type));
  const call = owners[index];
  const argument = index === 0 ? node : owners[index - 1];
  const isArgument = call?.type === 'CallExpression' && call.callee !== argument;
  return isArgument ? sinkOf(context, call, argument) : undefined;
}

function assignedTarget(node) {
  const holder = node.parent;
  if (holder.type === 'VariableDeclarator' && holder.init === node) {
    return holder.id;
  }
  return holder.type === 'AssignmentExpression' && holder.right === node ? holder.left : undefined;
}

export function variableSink(context, variable) {
  const sinks = (variable?.references ?? [])
    .filter((reference) => reference.isRead())
    .map((reference) => consumingSink(context, reference.identifier))
    .filter((sink) => sink !== undefined);
  return sinks.find((sink) => sink !== 'query') ?? sinks[0];
}

export function sinkFor(context, node) {
  const target = assignedTarget(node);
  const variable =
    target?.type === 'Identifier' ? findVariable(context, target, target.name) : undefined;
  return consumingSink(context, node) ?? variableSink(context, variable);
}
