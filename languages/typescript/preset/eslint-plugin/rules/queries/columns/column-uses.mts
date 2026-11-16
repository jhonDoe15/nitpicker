import { isFunctionNode } from '../../analysis/constant-resolution.mts';
import { memberName, unwrapped } from '../../security/security-values.mts';
import { isOrmCall, isQueryResult } from '../query-calls.mts';
import { soleField } from './sole-field.mts';
import { isIdsWrite } from '../rows/row-writes.mts';
import { isModelField } from './model-fields.mts';
import { isBooleanUse, isCountTest } from './boolean-uses.mts';
import { isProjection, loadedRows, singleRead } from '../rows/loaded-rows.mts';

export const COLUMN = 'column';
export const EXISTENCE = 'existence';

const COUNTS = new Set(['count', 'countBy']);
const SINGLES = new Set(['findOne', 'findOneBy', 'findFirst', 'findUnique']);

function mappedColumn(read) {
  const member = read.parent;
  const call = member.parent;
  const isMap =
    member.type === 'MemberExpression' &&
    member.object === read &&
    memberName(member) === 'map' &&
    call.type === 'CallExpression' &&
    call.callee === member &&
    call.arguments.length === 1;
  const callback = isMap ? call.arguments[0] : undefined;
  const field =
    callback !== undefined && isFunctionNode(callback) ? soleField(callback) : undefined;
  return field === undefined ? undefined : { call, field };
}

export function columnUse(context, scope, awaited) {
  const query = awaited.argument;
  const rows = isQueryResult(scope, awaited) ? loadedRows(context, awaited) : undefined;
  const read =
    rows?.reads.length === 1 && query.type === 'CallExpression' ? rows.reads[0] : undefined;
  const mapped = read === undefined || isProjection(query) ? undefined : mappedColumn(read);
  const eligible =
    mapped !== undefined &&
    !isIdsWrite(context, mapped.call, query) &&
    isModelField(context, awaited, mapped.field);
  return eligible ? { node: mapped.call, shape: COLUMN, field: mapped.field } : undefined;
}

const LOCKING = /lock|forUpdate|skipLocked|pessimistic/iu;

function isLocking(context, call) {
  return call.arguments.some((argument) => LOCKING.test(context.sourceCode.getText(argument)));
}

function plainCall(awaited) {
  const call = unwrapped(awaited.argument);
  const eligible =
    call.type === 'CallExpression' &&
    call.callee.type === 'MemberExpression' &&
    !call.arguments.some((argument) => isFunctionNode(unwrapped(argument)));
  return eligible ? call : undefined;
}

export function existenceUse(context, scope, awaited) {
  const call = plainCall(awaited);
  if (call === undefined || isProjection(call) || isLocking(context, call)) {
    return undefined;
  }
  const site = singleRead(context, awaited);
  if (site === undefined) {
    return undefined;
  }
  const counted = isOrmCall(scope, call, COUNTS) && isCountTest(site);
  const found = isOrmCall(scope, call, SINGLES) && isBooleanUse(site);
  return counted || found ? { node: call, shape: EXISTENCE } : undefined;
}
