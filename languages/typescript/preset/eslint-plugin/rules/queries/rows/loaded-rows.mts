import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { staticKey, unwrapped, type Context } from '../../security/security-values.mts';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { callChain } from '../query-calls.mts';
import { homeOf, outerOf } from '../result-uses.mts';

export type LoadedRows = {
  readonly reads: TSESTree.Node[];
  readonly home: TSESTree.Node | undefined;
};

const PROJECTIONS = new Set(['select', 'columns', 'attributes', 'fields']);
const DRIZZLE_SELECTS = new Set(['select', 'selectDistinct']);

function isGuardRead(read: TSESTree.Node): boolean {
  const outer = outerOf(read);
  const member = outer.parent;
  if (member === undefined) {
    return false;
  }
  const isLength =
    member.type === AST_NODE_TYPES.MemberExpression &&
    member.object === outer &&
    !member.computed &&
    nameOf(member.property) === 'length';
  const path = [member, ...ancestorsOf(member)];
  const test = path.find(
    (node) => node.parent?.type === AST_NODE_TYPES.IfStatement && node.parent.test === node,
  );
  return isLength && test !== undefined;
}

export function loadedRows(context: Context, awaited: TSESTree.Node): LoadedRows | undefined {
  const outer = outerOf(awaited);
  const declarator = outer.parent;
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator || declarator.init !== outer) {
    return { reads: [outer], home: homeOf(outer) };
  }
  if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const [variable] = context.sourceCode.getDeclaredVariables(declarator);
  const references = variable?.references ?? [];
  const writes = references.filter((reference) => reference.isWrite());
  const reads = references
    .filter((reference) => reference.isRead())
    .map((reference) => reference.identifier);
  return writes.length === 1
    ? { reads: reads.filter((read) => !isGuardRead(read)), home: homeOf(declarator) }
    : undefined;
}

export function singleRead(context: Context, node: TSESTree.Node): TSESTree.Node | undefined {
  const outer = outerOf(node);
  const declarator = outer.parent;
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator || declarator.init !== outer) {
    return outer;
  }
  if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const [variable] = context.sourceCode.getDeclaredVariables(declarator);
  const reads = variable?.references.filter((reference) => reference.isRead()) ?? [];
  return reads.length === 1 && variable?.references.length === 2 ? reads[0]?.identifier : undefined;
}

function hasProjectionKey(argument: TSESTree.CallExpressionArgument | undefined): boolean {
  const target = argument === undefined ? undefined : unwrapped(argument);
  return (
    target?.type === AST_NODE_TYPES.ObjectExpression &&
    target.properties.some((property) => PROJECTIONS.has(staticKey(property) ?? ''))
  );
}

export function isProjection(query: TSESTree.CallExpression): boolean {
  const drizzle = callChain(query).some(
    (call) =>
      call.callee.type === AST_NODE_TYPES.MemberExpression &&
      DRIZZLE_SELECTS.has(nameOf(call.callee.property) ?? '') &&
      call.arguments.length > 0,
  );
  return drizzle || query.arguments.some(hasProjectionKey);
}
