import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { unwrapped, type Context } from '../../../rules/security/security-values.mts';
import { isDeclared } from '../../support/scope.mts';
import { replacing, type FixPlan } from '../../support/ranges.mts';
import {
  expressionText,
  reduceSite,
  rewrittenCall,
  type Callback,
  type ReduceSite,
} from './reduce-site.mts';
import { hasObjectFromEntries, isPrimitiveKey } from './type-proofs.mts';

type EntryProperty = TSESTree.Property;

function entryKey(context: Context, property: EntryProperty): string | undefined {
  const { key } = property;
  return property.computed && isPrimitiveKey(context, key)
    ? expressionText(context.sourceCode, key)
    : undefined;
}

function isAnonymousDefinition(value: TSESTree.Node): boolean {
  const node = unwrapped(value);
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    ((node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ClassExpression) &&
      node.id === null)
  );
}

function singleEntry(site: ReduceSite): EntryProperty | undefined {
  const { result, accumulator } = site;
  if (result.type !== AST_NODE_TYPES.ObjectExpression || result.properties.length !== 2) {
    return undefined;
  }
  const [spread, entry] = result.properties;
  const reference = accumulator.references[0]?.identifier;
  return spread?.type === AST_NODE_TYPES.SpreadElement &&
    spread.argument === reference &&
    entry?.type === AST_NODE_TYPES.Property &&
    entry.kind === 'init' &&
    !entry.method &&
    !isAnonymousDefinition(entry.value)
    ? entry
    : undefined;
}

function fixOf(context: Context, callback: Callback): FixPlan | undefined {
  const { sourceCode } = context;
  const site = reduceSite(context, callback, 'object');
  const entry = site === undefined ? undefined : singleEntry(site);
  if (site === undefined || entry === undefined) {
    return undefined;
  }
  const key = entryKey(context, entry);
  if (
    key === undefined ||
    isDeclared(sourceCode, site.call, 'Object') ||
    !hasObjectFromEntries(context, site.call)
  ) {
    return undefined;
  }
  const result = `[${key}, ${expressionText(sourceCode, entry.value)}]`;
  const mapped = rewrittenCall(sourceCode, site, { method: 'map', result });
  return replacing(site.call.range, `Object.fromEntries(${mapped})`);
}

export function reduceObjectFix(context: Context, callback: TSESTree.Node): FixPlan | undefined {
  return callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    callback.type === AST_NODE_TYPES.FunctionExpression
    ? fixOf(context, callback)
    : undefined;
}
