import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { chainOf, nameOf } from './node-views.mts';

export type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
export type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
export type Callback = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type MaybeNode = TSESTree.Node | undefined;
export type ExportNode = TSESTree.ExportNamedDeclaration | TSESTree.ExportDefaultDeclaration;
type Wrapper =
  | TSESTree.TSNonNullExpression
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.TSInstantiationExpression
  | TSESTree.ChainExpression
  | TSESTree.AwaitExpression;
type VariableDefinition = TSESLint.Scope.Definitions.VariableDefinition;

const { DefinitionType } = TSESLint.Scope;

export const TYPE_ASSERTIONS = [
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSTypeAssertion,
];
export const ASSERTION_FORMS = [
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
];
export const ASSERTION_WRAPPERS = [...TYPE_ASSERTIONS, AST_NODE_TYPES.TSNonNullExpression];
export const TYPE_WRAPPERS = [
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.ChainExpression,
];
export const NULLISH_WRAPPERS = [
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
];

function isWrapper(node: TSESTree.Node): node is Wrapper {
  return (
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSInstantiationExpression ||
    node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.AwaitExpression
  );
}

export function wrappedExpression(
  node: TSESTree.Node,
  kinds: readonly AST_NODE_TYPES[],
): TSESTree.Node | undefined {
  if (!isWrapper(node)) {
    return undefined;
  }
  if (!kinds.includes(node.type)) {
    return undefined;
  }
  return node.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node.expression;
}

export function unwrapOf(node: TSESTree.Node, kinds: readonly AST_NODE_TYPES[]): TSESTree.Node;
export function unwrapOf(
  node: TSESTree.Node | undefined,
  kinds: readonly AST_NODE_TYPES[],
): TSESTree.Node | undefined;
export function unwrapOf(
  node: TSESTree.Node | undefined,
  kinds: readonly AST_NODE_TYPES[],
): TSESTree.Node | undefined {
  return chainOf(node, (link) => wrappedExpression(link, kinds)).at(-1);
}

export function resolvedThrough(
  context: SourceContext,
  node: TSESTree.Node | undefined,
  kinds: readonly AST_NODE_TYPES[],
): TSESTree.Node | undefined {
  const pending = [resolveConstant(context, node)];
  for (const current of pending) {
    const inner = current === undefined ? undefined : wrappedExpression(current, kinds);
    if (inner !== undefined) {
      pending.push(resolveConstant(context, inner));
    }
  }
  return pending.at(-1);
}

export function outermostOf(node: TSESTree.Node, kinds: readonly AST_NODE_TYPES[]): TSESTree.Node {
  const outer = chainOf(node, (current) => {
    const { parent } = current;
    return parent !== undefined && wrappedExpression(parent, kinds) === current
      ? parent
      : undefined;
  });
  return outer.at(-1) ?? node;
}

export function isLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal;
}

export function unwrapped(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, NULLISH_WRAPPERS);
}

export function literalValue(node: TSESTree.Node | undefined): unknown {
  return node?.type === AST_NODE_TYPES.Literal ? node.value : undefined;
}

export function assignedTarget(node: TSESTree.Node): TSESTree.Node | undefined {
  const holder = node.parent;
  if (holder?.type === AST_NODE_TYPES.VariableDeclarator && holder.init === node) {
    return holder.id;
  }
  return holder?.type === AST_NODE_TYPES.AssignmentExpression && holder.right === node
    ? holder.left
    : undefined;
}

export function isNamedMember(callee: TSESTree.Node, owner: string, name: string): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === owner &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === name
  );
}

export function operandsOf(root: TSESTree.Node, operator: string): TSESTree.Node[] {
  const pending = [root];
  const operands: TSESTree.Node[] = [];
  for (const node of pending) {
    const isJoin =
      (node.type === AST_NODE_TYPES.LogicalExpression ||
        node.type === AST_NODE_TYPES.BinaryExpression) &&
      node.operator === operator;
    if (isJoin) {
      pending.push(node.left, node.right);
    } else {
      operands.push(node);
    }
  }
  return operands;
}

export function memberKeyOf(
  member: { readonly computed: boolean; readonly property: TSESTree.Node },
  fallback: string,
): string {
  if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) {
    return member.property.name;
  }
  return member.property.type === AST_NODE_TYPES.Literal ? String(member.property.value) : fallback;
}

export function callChainLink(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return node.callee;
  }
  return node.type === AST_NODE_TYPES.MemberExpression ? node.object : undefined;
}

export function isFunction(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

export function isExported(declarator: TSESTree.VariableDeclarator): boolean {
  return declarator.parent.parent.type === AST_NODE_TYPES.ExportNamedDeclaration;
}

export function isCall(node: TSESTree.Node): node is CallLike {
  return node.type === AST_NODE_TYPES.CallExpression || node.type === AST_NODE_TYPES.NewExpression;
}

export function isCallExpression(node: TSESTree.Node): node is TSESTree.CallExpression {
  return node.type === AST_NODE_TYPES.CallExpression;
}

export function soleReturnedValue(fn: FunctionNode): TSESTree.Expression | undefined {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return fn.body;
  }
  const [only, ...rest] = fn.body.body;
  return rest.length === 0 && only?.type === AST_NODE_TYPES.ReturnStatement
    ? (only.argument ?? undefined)
    : undefined;
}

export function isExport(node: TSESTree.Node): node is ExportNode {
  return (
    node.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    node.type === AST_NODE_TYPES.ExportDefaultDeclaration
  );
}

export function calleeName(callee: TSESTree.Node): string {
  return calleeNameOf(callee) ?? '';
}

export function isCallback(node: MaybeNode): node is Callback {
  return (
    node?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node?.type === AST_NODE_TYPES.FunctionExpression
  );
}

export function calleeNameOf(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? nameOf(callee.property)
    : undefined;
}

function declaredName(statement: TSESTree.Node): string | undefined {
  const declaration = isExport(statement) ? statement.declaration : statement;
  if (declaration?.type === AST_NODE_TYPES.VariableDeclaration) {
    return nameOf(declaration.declarations[0].id);
  }
  return declaration !== null && 'id' in declaration ? nameOf(declaration.id) : undefined;
}

export function isExportedStatement(
  program: TSESTree.Node | undefined,
  statement: TSESTree.Node,
): boolean {
  if (isExport(statement)) {
    return true;
  }
  const name = declaredName(statement);
  return (
    name !== undefined &&
    program?.type === AST_NODE_TYPES.Program &&
    program.body.some(
      (other) =>
        other.type === AST_NODE_TYPES.ExportNamedDeclaration &&
        other.source === null &&
        other.specifiers.some((specifier) => nameOf(specifier.local) === name),
    )
  );
}

export function constDefinition(
  context: SourceContext,
  node: TSESTree.Identifier,
): VariableDefinition | undefined {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === DefinitionType.Variable && definition.parent.kind === 'const'
    ? definition
    : undefined;
}

export function chainRootName(node: TSESTree.Node): string | undefined {
  const root = chainOf<TSESTree.Node>(node, (link) => {
    if (link.type === AST_NODE_TYPES.MemberExpression) {
      return link.object;
    }
    return link.type === AST_NODE_TYPES.CallExpression ? link.callee : undefined;
  }).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}
