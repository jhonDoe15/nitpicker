import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { callsWithin } from '../../effects/held-scopes.mts';
import { memberName, staticKey, unwrapped, type Context } from '../../security/security-values.mts';
import { callChain, isRepositoryLike, receiverNames } from '../query-calls.mts';
import { singleRead, type LoadedRows } from './loaded-rows.mts';
import { assignsOnly, loopOf } from './assignments.mts';
import { mappedField } from '../columns/sole-field.mts';

export const UPDATE = 'update';
export const DELETE = 'delete';

const SAVES: ReadonlySet<string> = new Set(['save', 'persistAndFlush', 'bulkCreate']);
const REMOVES: ReadonlySet<string> = new Set(['remove', 'softRemove', 'removeAndFlush']);
type WriteKind = typeof UPDATE | typeof DELETE;
export type WriteShape = { readonly node: TSESTree.Node; readonly shape: WriteKind };

const ID_WRITES = new Map<string | undefined, WriteKind>([
  [DELETE, DELETE],
  ['deleteMany', DELETE],
  ['destroy', DELETE],
  ['softDelete', DELETE],
  ['nativeDelete', DELETE],
  [UPDATE, UPDATE],
  ['updateMany', UPDATE],
  ['nativeUpdate', UPDATE],
]);
const ID_HELPERS = new Set(['In', 'inArray', 'any', 'Any', 'anyOf']);
const DRIZZLE_WRITES = new Map<string | undefined, WriteKind>([
  [DELETE, DELETE],
  [UPDATE, UPDATE],
]);

function calleeName(call: TSESTree.CallExpression): string | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return memberName(callee);
  }
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
}

function receiverOf(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const callee = unwrapped(call.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
}

function receiverPath(call: TSESTree.CallExpression): string {
  const receiver = receiverOf(call);
  return receiver === undefined ? '' : receiverNames(receiver).join('.');
}

function sinkOf(read: TSESTree.Node): TSESTree.CallExpression | undefined {
  const call = read.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== read) {
    return undefined;
  }
  return receiverOf(call) === undefined ? undefined : call;
}

function hasUpdateOption(call: TSESTree.CallExpression): boolean {
  const [, options] = call.arguments;
  const target = options === undefined ? undefined : unwrapped(options);
  return (
    target?.type === AST_NODE_TYPES.ObjectExpression &&
    target.properties.some((property) => staticKey(property) === 'updateOnDuplicate')
  );
}

function isSinkOn(
  call: TSESTree.CallExpression,
  query: TSESTree.CallExpression,
  names: ReadonlySet<string>,
): boolean {
  const sinkNames = receiverNames(receiverOf(call) ?? call);
  const sameReceiver = receiverPath(call) === receiverPath(query);
  const method = calleeName(call);
  return (
    method !== undefined &&
    names.has(method) &&
    (sameReceiver || isRepositoryLike(sinkNames)) &&
    (method !== 'bulkCreate' || hasUpdateOption(call))
  );
}

function flushAfter(
  context: Context,
  query: TSESTree.CallExpression,
  { loop, home }: { readonly loop: TSESTree.Node; readonly home: TSESTree.Node | undefined },
): TSESTree.CallExpression | undefined {
  const receiver = receiverOf(query);
  if (home === undefined || receiver === undefined) {
    return undefined;
  }
  const text = context.sourceCode.getText(receiver);
  return callsWithin(home, context.sourceCode.visitorKeys)
    .filter((call) => call.type === AST_NODE_TYPES.CallExpression)
    .find((call) => {
      const callee = unwrapped(call.callee);
      return (
        call.range[0] >= loop.range[1] &&
        callee.type === AST_NODE_TYPES.MemberExpression &&
        memberName(callee) === 'flush' &&
        context.sourceCode.getText(callee.object) === text
      );
    });
}

function updateShape(
  context: Context,
  rows: LoadedRows,
  query: TSESTree.CallExpression,
): WriteShape | undefined {
  const [first, second, ...rest] = rows.reads;
  const looped = first === undefined ? undefined : loopOf(first);
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

function removeShape(rows: LoadedRows, query: TSESTree.CallExpression): WriteShape | undefined {
  const [read] = rows.reads;
  const sink = rows.reads.length === 1 && read !== undefined ? sinkOf(read) : undefined;
  return sink !== undefined && isSinkOn(sink, query, REMOVES)
    ? { node: sink, shape: DELETE }
    : undefined;
}

function idsOf(read: TSESTree.Node): TSESTree.CallExpression | undefined {
  return mappedField(read)?.call;
}

function chainNames(call: TSESTree.CallExpression): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  const pending: TSESTree.Node[] = [call];
  for (const current of pending) {
    const callee = current.type === AST_NODE_TYPES.CallExpression ? unwrapped(current.callee) : undefined;
    if (callee?.type === AST_NODE_TYPES.MemberExpression) {
      names.push(memberName(callee));
      pending.push(unwrapped(callee.object));
    }
  }
  return names;
}

const MAX_HOPS = 8;
const PASS_THROUGH = new Set<string>([
  AST_NODE_TYPES.Property,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.ArrayExpression,
]);

type Hop = { readonly next?: TSESTree.Node; readonly found?: TSESTree.CallExpression };

function nextHop(context: Context, current: TSESTree.Node): Hop {
  const { parent } = current;
  if (parent === undefined) {
    return {};
  }
  if (PASS_THROUGH.has(parent.type)) {
    return { next: parent };
  }
  if (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some((argument) => argument === current)
  ) {
    return ID_HELPERS.has(calleeName(parent) ?? '') ? { next: parent } : { found: parent };
  }
  const declared = parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === current;
  const read = declared ? singleRead(context, current) : undefined;
  return read === undefined ? {} : { next: read };
}

function consumerOf(context: Context, node: TSESTree.Node): TSESTree.CallExpression | undefined {
  const pending = [node];
  for (const current of pending) {
    const hop = nextHop(context, current);
    if (hop.found !== undefined || hop.next === undefined) {
      return hop.found;
    }
    if (pending.length >= MAX_HOPS) {
      break;
    }
    pending.push(hop.next);
  }
  return undefined;
}

function idWriteKind(consumer: TSESTree.CallExpression): WriteKind | undefined {
  const name = calleeName(consumer);
  if (name === 'where') {
    return chainNames(consumer)
      .map((each) => DRIZZLE_WRITES.get(each))
      .find((kind) => kind !== undefined);
  }
  return ID_WRITES.get(name);
}

const DRIZZLE_TABLES = new Set<string | undefined>(['from', DELETE, UPDATE]);

function drizzleTable(context: Context, call: TSESTree.CallExpression): string | undefined {
  const found = callChain(call).find((each) => DRIZZLE_TABLES.has(calleeName(each)));
  const [table] = found?.arguments ?? [];
  return table === undefined ? undefined : context.sourceCode.getText(table);
}

function sameTable(
  context: Context,
  query: TSESTree.CallExpression,
  consumer: TSESTree.CallExpression,
): boolean {
  const isDrizzle = callChain(query).some((each) => calleeName(each) === 'from');
  if (isDrizzle) {
    return drizzleTable(context, query) === drizzleTable(context, consumer);
  }
  return receiverPath(query) === receiverPath(consumer);
}

function idsWrite(
  context: Context,
  mapped: TSESTree.CallExpression,
  query: TSESTree.CallExpression,
): WriteShape | undefined {
  const consumer = consumerOf(context, mapped);
  const shape = consumer === undefined ? undefined : idWriteKind(consumer);
  return consumer !== undefined && shape !== undefined && sameTable(context, query, consumer)
    ? { node: consumer, shape }
    : undefined;
}

export function isIdsWrite(
  context: Context,
  mapped: TSESTree.CallExpression,
  query: TSESTree.CallExpression,
): boolean {
  return idsWrite(context, mapped, query) !== undefined;
}

function idsShape(
  context: Context,
  rows: LoadedRows,
  query: TSESTree.CallExpression,
): WriteShape | undefined {
  const [read] = rows.reads;
  const mapped = rows.reads.length === 1 && read !== undefined ? idsOf(read) : undefined;
  return mapped === undefined ? undefined : idsWrite(context, mapped, query);
}

export function writeShape(
  context: Context,
  rows: LoadedRows,
  query: TSESTree.CallExpression,
): WriteShape | undefined {
  if (rows.reads.length === 0) {
    return undefined;
  }
  return (
    updateShape(context, rows, query) ?? removeShape(rows, query) ?? idsShape(context, rows, query)
  );
}
