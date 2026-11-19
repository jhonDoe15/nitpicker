import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../../rules/analysis/constant-resolution.mts';
import type { Context } from '../../rules/security/security-values.mts';
import { ancestorsOf } from '../../rules/typed/node-views.mts';
import { hasCommentIn, replacing, type ReportFix } from '../support/ranges.mts';
import { isUnderDeadline } from './facts/deadline-guard.mts';
import { hasPlainItems } from './facts/element-types.mts';
import { callbackFunction, mapShape, mayBeSparse } from './facts/map-shape.mts';
import { importingDependency, planWithImport } from './facts/package-facts.mts';
import { isStableReceiver } from './facts/stable-receiver.mts';
import { FAN_OUT_LIMIT } from './p-map-fix.mts';

const DEPENDENCY = { module: 'p-map', local: 'pMap', esmOnlyFrom: 5 };

function runsInAsyncCode(call: TSESTree.CallExpression): boolean {
  const fn = ancestorsOf(call).find(isFunctionNode);
  return fn === undefined ? call.parent.type === AST_NODE_TYPES.AwaitExpression : fn.async;
}

export function mapToPMapFix(
  context: Context,
  call: TSESTree.CallExpression,
): ReportFix | undefined {
  const { sourceCode } = context;
  const shape = mapShape(call);
  if (
    shape === undefined ||
    hasCommentIn(sourceCode, call.range) ||
    !runsInAsyncCode(call) ||
    mayBeSparse(shape.receiver) ||
    !isStableReceiver(context, shape) ||
    callbackFunction(context, shape.callback) === undefined ||
    !hasPlainItems(context, shape.receiver) ||
    isUnderDeadline(context, call)
  ) {
    return undefined;
  }
  const edit = importingDependency(context, call, DEPENDENCY);
  if (edit === undefined) {
    return undefined;
  }
  const options = `{ concurrency: ${String(FAN_OUT_LIMIT)} }`;
  const text = `${edit.local}(${sourceCode.getText(shape.receiver)}, ${sourceCode.getText(shape.callback)}, ${options})`;
  return planWithImport(edit, [replacing(call.range, text)]);
}
