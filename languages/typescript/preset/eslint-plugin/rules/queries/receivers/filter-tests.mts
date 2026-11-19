import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../../security/security-values.mts';
import { rootName } from '../../database/orm-modules.mts';
import { depthFirst, nodeChildren } from '../../typed/node-views.mts';

const MEMBERSHIP_OWNED = 'has';
const MEMBERSHIP_ANY = 'includes';

function boundName(param: TSESTree.Parameter): string[] {
  if (param.type === AST_NODE_TYPES.Identifier) {
    return [param.name];
  }
  if (param.type !== AST_NODE_TYPES.ObjectPattern) {
    return [];
  }
  return param.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property && property.value.type === AST_NODE_TYPES.Identifier
      ? [property.value.name]
      : [],
  );
}

function boundNames(params: readonly TSESTree.Parameter[]): Set<string> {
  return new Set(params.flatMap(boundName));
}

function isDerivedFrom(
  context: Context,
  collection: TSESTree.Node,
  source: string | undefined,
): boolean {
  const name = rootName(collection);
  if (source === undefined || name === undefined) {
    return false;
  }
  if (name === source) {
    return true;
  }
  const definition = findVariable(context, collection, name)?.defs.at(0)?.node;
  const init = definition?.type === AST_NODE_TYPES.VariableDeclarator ? definition.init : undefined;
  return (
    init !== null &&
    init !== undefined &&
    [...depthFirst<TSESTree.Node>(init, nodeChildren)].some(
      (node) => node.type === AST_NODE_TYPES.Identifier && node.name === source,
    )
  );
}

function isClosureMembership(
  context: Context,
  node: TSESTree.Node,
  scope: { readonly rows: ReadonlySet<string>; readonly source: string | undefined },
): boolean {
  const callee = node.type === AST_NODE_TYPES.CallExpression ? unwrapped(node.callee) : undefined;
  if (callee?.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const method = memberName(callee);
  const root = rootName(callee.object);
  const membership = method === MEMBERSHIP_OWNED || method === MEMBERSHIP_ANY;
  return (
    membership && !scope.rows.has(root ?? '') && isDerivedFrom(context, callee.object, scope.source)
  );
}

function isLengthRead(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.MemberExpression && memberName(node) === 'length';
}

export function isColumnComparison(
  context: Context,
  callback: TSESTree.Node | undefined,
  receiver: TSESTree.Node,
): boolean {
  const fn = unwrapped(callback);
  if (
    fn?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    fn?.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return true;
  }
  if (fn.returnType?.typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate) {
    return false;
  }
  const scope = { rows: boundNames(fn.params), source: rootName(receiver) };
  return ![...depthFirst<TSESTree.Node>(fn.body, nodeChildren)].some(
    (node) => isLengthRead(node) || isClosureMembership(context, node, scope),
  );
}
