import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { JoinSite } from '../../../rules/joins/relation-types.mts';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { addingProperty } from '../../support/objects.mts';
import type { FixPlan } from '../../support/ranges.mts';
import { avoidsRelations, hasOnlyKeys, optionAccepts } from './option-types.mts';

const KEYS = new Set(['populate', 'fields', 'limit', 'offset']);
const KEYLESS = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike;

function isKeylessValue(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const type = services.getTypeAtLocation(node);
  return (type.flags & KEYLESS) !== 0 || type.getConstructSignatures().length > 0;
}

function isFilterSafe(
  context: Context,
  node: TSESTree.Node,
  relations: ReadonlySet<string>,
): boolean {
  return node.type === AST_NODE_TYPES.ObjectExpression
    ? avoidsRelations(node, relations)
    : isKeylessValue(context, node);
}

export function mikroStrategyFix(
  context: Context,
  { join, call }: { readonly join: JoinSite; readonly call: TSESTree.CallExpression },
): FixPlan | undefined {
  const { node: options } = join;
  if (
    options.type !== AST_NODE_TYPES.ObjectExpression ||
    !hasOnlyKeys(options, KEYS) ||
    call.arguments.at(-1) !== options
  ) {
    return undefined;
  }
  const relations = new Set([...join.joined.keys()].map((path) => path.split('.')[0] ?? ''));
  const filters = call.arguments.slice(0, -1);
  const clean =
    filters.every((argument) => isFilterSafe(context, argument, relations)) &&
    optionAccepts(context, options, { key: 'strategy', literal: 'select-in' });
  return clean ? addingProperty(context.sourceCode, options, "strategy: 'select-in'") : undefined;
}
