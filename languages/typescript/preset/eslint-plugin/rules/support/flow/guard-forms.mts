import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

const LEAVES = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.BreakStatement,
]);

export function unwrap(node: TSESTree.Node): TSESTree.Node {
  const pending = [node];
  for (const current of pending) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSNonNullExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression
    ) {
      pending.push(current.expression);
    }
  }
  return pending.at(-1) ?? node;
}

export function leaves(statement: TSESTree.Statement): boolean {
  const pending = [statement];
  for (const current of pending) {
    if (LEAVES.has(current.type)) {
      return true;
    }
    const inner = current.type === AST_NODE_TYPES.BlockStatement ? current.body : [];
    for (const item of inner) {
      pending.push(item);
    }
  }
  return false;
}

export function mathMethodOf(node: TSESTree.Node): string | undefined {
  return node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'Math' &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
    ? node.callee.property.name
    : undefined;
}

export function soleInitializer(
  context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
  node: TSESTree.Identifier,
): TSESTree.Node | undefined {
  const variable = context.sourceCode
    .getScope(node)
    .references.find(({ identifier }) => identifier === node)?.resolved;
  const [definition] = variable?.defs ?? [];
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  if (
    variable?.defs.length !== 1 ||
    writes.length !== 1 ||
    definition?.node.type !== AST_NODE_TYPES.VariableDeclarator
  ) {
    return undefined;
  }
  return definition.node.init ?? undefined;
}

export function escapeText(value: string): string {
  return value.replaceAll(/[$.*+?()[\]{}|\\^]/gu, (character) => `\\${character}`);
}
