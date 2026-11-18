import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { hasSingleType } from '../../../rules/support/array-items.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { startsFromSizedArray } from '../support/fresh-arrays.mts';
import { replacing, type FixPlan } from '../../support/ranges.mts';
import {
  asExpressionBody,
  expressionText,
  reduceSite,
  rewrittenCall,
  type Callback,
  type ReduceSite,
} from './reduce-site.mts';
import { hasDenseDefiniteArrayType, hasMethod } from './type-proofs.mts';

type Rewrite = { readonly method: 'map' | 'flatMap'; readonly result: string };

function appendedTail(site: ReduceSite): readonly TSESTree.Node[] | undefined {
  const { result, accumulator } = site;
  if (result.type !== AST_NODE_TYPES.ArrayExpression) {
    return undefined;
  }
  const [lead, ...tail] = result.elements;
  const reference = accumulator.references[0]?.identifier;
  const present = tail.filter((element) => element !== null);
  return lead?.type === AST_NODE_TYPES.SpreadElement &&
    lead.argument === reference &&
    present.length === tail.length &&
    present.length > 0
    ? present
    : undefined;
}

function rewriteOf(context: Context, tail: readonly TSESTree.Node[]): Rewrite | undefined {
  const { sourceCode } = context;
  const [only] = tail;
  if (tail.length > 1) {
    const items = sourceCode.text.slice(only?.range[0], tail.at(-1)?.range[1]);
    return { method: 'flatMap', result: `[${items}]` };
  }
  if (only?.type === AST_NODE_TYPES.SpreadElement) {
    return hasDenseDefiniteArrayType(context, only.argument)
      ? { method: 'flatMap', result: expressionText(sourceCode, only.argument) }
      : undefined;
  }
  return only === undefined
    ? undefined
    : { method: 'map', result: expressionText(sourceCode, only) };
}

function hasSingleResult(context: Context, tail: readonly TSESTree.Node[]): boolean {
  const [only] = tail;
  return (
    tail.length !== 1 ||
    only?.type !== AST_NODE_TYPES.SpreadElement ||
    hasSingleType(context, only.argument)
  );
}

function fixOf(context: Context, callback: Callback): FixPlan | undefined {
  const { sourceCode } = context;
  const site = reduceSite(context, callback, 'array');
  const tail = site === undefined ? undefined : appendedTail(site);
  const rewrite = tail === undefined ? undefined : rewriteOf(context, tail);
  if (
    site === undefined ||
    rewrite === undefined ||
    tail === undefined ||
    startsFromSizedArray(site.receiver) ||
    !hasSingleResult(context, tail)
  ) {
    return undefined;
  }
  if (rewrite.method === 'flatMap' && !hasMethod(context, site.receiver, 'flatMap')) {
    return undefined;
  }
  const result = asExpressionBody(site, rewrite.result);
  return replacing(
    site.call.range,
    rewrittenCall(sourceCode, site, { method: rewrite.method, result }),
  );
}

export function reduceArrayFix(context: Context, callback: TSESTree.Node): FixPlan | undefined {
  return callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    callback.type === AST_NODE_TYPES.FunctionExpression
    ? fixOf(context, callback)
    : undefined;
}
