import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import { chainOf, variableNamed } from '../typed/node-views.mts';

type TypeWrapper =
  TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression | TSESTree.TSNonNullExpression;

const { DefinitionType } = TSESLint.Scope;

function isTypeWrapper(node: TSESTree.Node | undefined): node is TypeWrapper {
  return (
    node?.type === AST_NODE_TYPES.TSAsExpression ||
    node?.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node?.type === AST_NODE_TYPES.TSNonNullExpression
  );
}

function unwrapped(node: TSESTree.Node | undefined): TSESTree.Node | undefined {
  return chainOf(node, (current) => (isTypeWrapper(current) ? current.expression : undefined)).at(
    -1,
  );
}

function throughMembers(identifier: TSESTree.Node): TSESTree.Node {
  const chain = [identifier];
  for (const node of chain) {
    const { parent } = node;
    if (
      (parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === node) ||
      (isTypeWrapper(parent) && parent.expression === node)
    ) {
      chain.push(parent);
    }
  }
  return chain.at(-1) ?? identifier;
}

function aliasOf(identifier: TSESTree.Node): TSESTree.Identifier | undefined {
  const value =
    chainOf(identifier, (node) => (isTypeWrapper(node.parent) ? node.parent : undefined)).at(-1) ??
    identifier;
  const parent = value.parent;
  return parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === value &&
    parent.id.type === AST_NODE_TYPES.Identifier &&
    parent.parent.kind === 'const'
    ? parent.id
    : undefined;
}

function canMutate(identifier: TSESTree.Node): boolean {
  const outer = throughMembers(identifier);
  const parent = outer.parent;
  if (parent?.type === AST_NODE_TYPES.AssignmentExpression) {
    return true;
  }
  if (parent?.type === AST_NODE_TYPES.UpdateExpression) {
    return true;
  }
  if (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'delete') {
    return true;
  }
  if (
    parent?.type === AST_NODE_TYPES.CallExpression ||
    parent?.type === AST_NODE_TYPES.NewExpression
  ) {
    return true;
  }
  return (
    parent !== undefined &&
    [
      AST_NODE_TYPES.ReturnStatement,
      AST_NODE_TYPES.ArrowFunctionExpression,
      AST_NODE_TYPES.Property,
      AST_NODE_TYPES.ArrayExpression,
    ].includes(parent.type)
  );
}

function initializerAliases(variable: TSESLint.Scope.Variable): TSESTree.Identifier[] {
  const definition = variable.defs[0];
  const initializer = unwrapped(
    definition?.type === DefinitionType.Variable ? (definition.node.init ?? undefined) : undefined,
  );
  return initializer?.type === AST_NODE_TYPES.Identifier ? [initializer] : [];
}

function inspectReferences(
  context: SourceContext,
  variable: TSESLint.Scope.Variable,
  call: TSESTree.Node,
): { mutated: boolean; aliases: TSESTree.Identifier[] } {
  const aliases = initializerAliases(variable);
  const callScope = context.sourceCode.getScope(call).variableScope;
  for (const reference of variable.references) {
    const name = reference.identifier;
    const afterCall = reference.from.variableScope === callScope && name.range[0] >= call.range[0];
    if (reference.init || afterCall) {
      continue;
    }
    const alias = aliasOf(name);
    if (alias !== undefined) {
      aliases.push(alias);
    } else if (canMutate(name)) {
      return { mutated: true, aliases };
    }
  }
  return { mutated: false, aliases };
}

export function optionsMayChange(
  context: SourceContext,
  node: TSESTree.Node | undefined,
  call: TSESTree.Node,
): boolean {
  const initial = unwrapped(node);
  if (initial?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const pending = [initial];
  const visited = new Set<TSESLint.Scope.Variable>();
  for (const identifier of pending) {
    const variable = variableNamed(context.sourceCode, identifier);
    if (variable === undefined || visited.has(variable)) {
      continue;
    }
    visited.add(variable);
    const inspected = inspectReferences(context, variable, call);
    if (inspected.mutated) {
      return true;
    }
    pending.push(...inspected.aliases);
  }
  return false;
}
