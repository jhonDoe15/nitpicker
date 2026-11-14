import { callsWithin } from '../../effects/held-scopes.mjs';
import { isFunctionNode } from '../../analysis/constant-resolution.mjs';
import { memberName, staticKey, unwrapped } from '../../security/security-values.mjs';
import { callChain, isRepositoryLike, receiverNames } from '../query-calls.mjs';
import { singleRead } from './loaded-rows.mjs';
import { assignsOnly, loopOf } from './assignments.mjs';
import { soleField } from '../columns/sole-field.mjs';

export const UPDATE = 'update';
export const DELETE = 'delete';

const SAVES = new Set(['save', 'persistAndFlush', 'bulkCreate']);
const REMOVES = new Set(['remove', 'softRemove', 'removeAndFlush']);
const ID_WRITES = new Map([
  ['delete', DELETE],
  ['deleteMany', DELETE],
  ['destroy', DELETE],
  ['softDelete', DELETE],
  ['nativeDelete', DELETE],
  ['update', UPDATE],
  ['updateMany', UPDATE],
  ['nativeUpdate', UPDATE],
]);
const ID_HELPERS = new Set(['In', 'inArray', 'any', 'Any', 'anyOf']);
const DRIZZLE_WRITES = new Map([
  ['delete', DELETE],
  ['update', UPDATE],
]);

function calleeName(call) {
  const callee = unwrapped(call.callee);
  if (callee.type === 'MemberExpression') {
    return memberName(callee);
  }
  return callee.type === 'Identifier' ? callee.name : undefined;
}

function sinkOf(read) {
  const call = read.parent;
  const isArgument = call.type === 'CallExpression' && call.arguments[0] === read;
  return isArgument && unwrapped(call.callee).type === 'MemberExpression' ? call : undefined;
}

function hasUpdateOption(call) {
  const [, options] = call.arguments;
  const target = options === undefined ? undefined : unwrapped(options);
  return (
    target?.type === 'ObjectExpression' &&
    target.properties.some((property) => staticKey(property) === 'updateOnDuplicate')
  );
}

function isSinkOn(call, query, names) {
  const sinkNames = receiverNames(unwrapped(call.callee).object);
  const sameReceiver = sinkNames.join('.') === receiverNames(query.callee.object).join('.');
  const method = calleeName(call);
  return (
    names.has(method) &&
    (sameReceiver || isRepositoryLike(sinkNames)) &&
    (method !== 'bulkCreate' || hasUpdateOption(call))
  );
}

function flushAfter(context, query, { loop, home }) {
  const text = context.sourceCode.getText(query.callee.object);
  return callsWithin(home, context.sourceCode.visitorKeys).find((call) => {
    const callee = unwrapped(call.callee);
    return (
      call.range[0] >= loop.range[1] &&
      callee.type === 'MemberExpression' &&
      memberName(callee) === 'flush' &&
      context.sourceCode.getText(callee.object) === text
    );
  });
}

function updateShape(context, rows, query) {
  const [first, second, ...rest] = rows.reads;
  const looped = loopOf(first);
  const loop = looped ?? (second === undefined ? undefined : loopOf(second));
  const other = looped === undefined ? first : second;
  if (loop === undefined || rest.length > 0 || !assignsOnly(loop.body, loop.element)) {
    return undefined;
  }
  if (other === undefined) {
    const flush = flushAfter(context, query, { loop: loop.loop, home: rows.home });
    return flush === undefined ? undefined : { node: flush, shape: UPDATE };
  }
  const sink = sinkOf(other);
  return sink !== undefined && isSinkOn(sink, query, SAVES)
    ? { node: sink, shape: UPDATE }
    : undefined;
}

function removeShape(rows, query) {
  const [read] = rows.reads;
  const sink = rows.reads.length === 1 ? sinkOf(read) : undefined;
  return sink !== undefined && isSinkOn(sink, query, REMOVES)
    ? { node: sink, shape: DELETE }
    : undefined;
}

function idsOf(read) {
  const member = read.parent;
  const call = member.parent;
  const isMap =
    member.type === 'MemberExpression' &&
    member.object === read &&
    memberName(member) === 'map' &&
    call.type === 'CallExpression' &&
    call.callee === member;
  const callback = isMap ? call.arguments[0] : undefined;
  return callback !== undefined && isFunctionNode(callback) && soleField(callback) !== undefined
    ? call
    : undefined;
}

function chainNames(call) {
  const names = [];
  let current = call;
  while (
    current?.type === 'CallExpression' &&
    unwrapped(current.callee).type === 'MemberExpression'
  ) {
    names.push(memberName(unwrapped(current.callee)));
    current = unwrapped(unwrapped(current.callee).object);
  }
  return names;
}

const MAX_HOPS = 8;
const PASS_THROUGH = new Set(['Property', 'ObjectExpression', 'ArrayExpression']);

function nextHop(context, current) {
  const { parent } = current;
  if (PASS_THROUGH.has(parent.type)) {
    return { next: parent };
  }
  if (parent.type === 'CallExpression' && parent.arguments.includes(current)) {
    return ID_HELPERS.has(calleeName(parent)) ? { next: parent } : { found: parent };
  }
  const declared = parent.type === 'VariableDeclarator' && parent.init === current;
  const read = declared ? singleRead(context, current) : undefined;
  return read === undefined ? {} : { next: read };
}

function consumerOf(context, node) {
  let current = node;
  for (let step = 0; step < MAX_HOPS; step += 1) {
    const hop = nextHop(context, current);
    if (hop.found !== undefined || hop.next === undefined) {
      return hop.found;
    }
    current = hop.next;
  }
  return undefined;
}

function idWriteKind(consumer) {
  const name = calleeName(consumer);
  if (name === 'where') {
    return chainNames(consumer)
      .map((each) => DRIZZLE_WRITES.get(each))
      .find(Boolean);
  }
  return ID_WRITES.get(name);
}

const DRIZZLE_TABLES = new Set(['from', 'delete', 'update']);

function drizzleTable(context, call) {
  const found = callChain(call).find((each) => DRIZZLE_TABLES.has(calleeName(each)));
  const [table] = found?.arguments ?? [];
  return table === undefined ? undefined : context.sourceCode.getText(table);
}

function sameTable(context, query, consumer) {
  const isDrizzle = callChain(query).some((each) => calleeName(each) === 'from');
  if (isDrizzle) {
    return drizzleTable(context, query) === drizzleTable(context, consumer);
  }
  const names = (call) => receiverNames(unwrapped(call.callee).object).join('.');
  return names(query) === names(consumer);
}

function idsWrite(context, mapped, query) {
  const consumer = consumerOf(context, mapped);
  const shape = consumer === undefined ? undefined : idWriteKind(consumer);
  return shape !== undefined && sameTable(context, query, consumer)
    ? { node: consumer, shape }
    : undefined;
}

function idsShape(context, rows, query) {
  const mapped = rows.reads.length === 1 ? idsOf(rows.reads[0]) : undefined;
  return mapped === undefined ? undefined : idsWrite(context, mapped, query);
}

export function writeShape(context, rows, query) {
  if (rows.reads.length === 0) {
    return undefined;
  }
  return (
    updateShape(context, rows, query) ?? removeShape(rows, query) ?? idsShape(context, rows, query)
  );
}
