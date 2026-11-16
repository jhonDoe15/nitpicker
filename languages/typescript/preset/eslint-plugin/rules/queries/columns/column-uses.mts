import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../../analysis/constant-resolution.mts';
import { unwrapped, type Context } from '../../security/security-values.mts';
import { type MemberCall } from '../../events/emitter-creations.mts';
import { isOrmCall, isQueryResult, type QueryScope } from '../query-calls.mts';
import { mappedField, type MappedField } from './sole-field.mts';
import { isIdsWrite } from '../rows/row-writes.mts';
import { isModelField } from './model-fields.mts';
import { isBooleanUse, isCountTest } from './boolean-uses.mts';
import { isProjection, loadedRows, singleRead } from '../rows/loaded-rows.mts';

export const COLUMN = 'column';
export const EXISTENCE = 'existence';

const COUNTS = new Set(['count', 'countBy']);
const SINGLES = new Set(['findOne', 'findOneBy', 'findFirst', 'findUnique']);

export type ColumnUse = {
  readonly node: TSESTree.Node;
  readonly shape: typeof COLUMN | typeof EXISTENCE;
  readonly field?: string;
};

function isMemberCall(node: TSESTree.Node): node is MemberCall {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression
  );
}

function mappedColumn(read: TSESTree.Node): MappedField | undefined {
  const mapped = mappedField(read);
  return mapped?.call.arguments.length === 1 ? mapped : undefined;
}

export function columnUse(
  context: Context,
  scope: QueryScope,
  awaited: TSESTree.AwaitExpression,
): ColumnUse | undefined {
  const query = awaited.argument;
  if (query.type !== AST_NODE_TYPES.CallExpression || !isQueryResult(scope, awaited)) {
    return undefined;
  }
  const rows = loadedRows(context, awaited);
  const read = rows?.reads.length === 1 ? rows.reads[0] : undefined;
  const mapped = read === undefined || isProjection(query) ? undefined : mappedColumn(read);
  const eligible =
    mapped !== undefined &&
    !isIdsWrite(context, mapped.call, query) &&
    isModelField(context, awaited, mapped.field);
  return eligible ? { node: mapped.call, shape: COLUMN, field: mapped.field } : undefined;
}

const LOCKING = /lock|forUpdate|skipLocked|pessimistic/iu;

function isLocking(context: Context, call: TSESTree.CallExpression): boolean {
  return call.arguments.some((argument) => LOCKING.test(context.sourceCode.getText(argument)));
}

function plainCall(awaited: TSESTree.AwaitExpression): MemberCall | undefined {
  const call = unwrapped(awaited.argument);
  const eligible =
    isMemberCall(call) && !call.arguments.some((argument) => isFunctionNode(unwrapped(argument)));
  return eligible ? call : undefined;
}

export function existenceUse(
  context: Context,
  scope: QueryScope,
  awaited: TSESTree.AwaitExpression,
): ColumnUse | undefined {
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
