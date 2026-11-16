import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, isNode, scopeChain, type SourceCode } from '../typed/node-views.mts';

export type SourceContext = { readonly sourceCode: SourceCode };
type MaybeNode = TSESTree.Node | undefined;
type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
type NumericEntry = {
  readonly node: MaybeNode;
  readonly depth: number;
  readonly parent?: NumericEntry | undefined;
};

type FunctionNameNode = TSESLint.Scope.Definitions.FunctionNameDefinition['node'];

const { DefinitionType } = TSESLint.Scope;

function typeWrapped(node: TSESTree.Node): TSESTree.Expression | undefined {
  return node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion
    ? node.expression
    : undefined;
}

const MAX_RESOLVE_DEPTH = 8;

export function isFunctionNode(node: unknown): node is FunctionNode {
  return (
    isNode(node) &&
    (node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionDeclaration)
  );
}

export function stringValue(node: unknown): string | undefined {
  if (!isNode(node)) {
    return undefined;
  }
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

export function findVariable(
  context: SourceContext,
  node: TSESTree.Node,
  name: string,
): TSESLint.Scope.Variable | undefined {
  for (const scope of scopeChain(context.sourceCode.getScope(node))) {
    const variable = scope.set.get(name);
    if (variable) {
      return variable;
    }
  }
  return undefined;
}

function constantInitializer(
  context: SourceContext,
  node: MaybeNode,
  depth: number,
): TSESTree.Expression | undefined {
  if (node?.type !== AST_NODE_TYPES.Identifier || depth > MAX_RESOLVE_DEPTH) {
    return undefined;
  }
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === DefinitionType.Variable &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === AST_NODE_TYPES.Identifier
    ? (definition.node.init ?? undefined)
    : undefined;
}

function unwrapTypes(node: TSESTree.Node): TSESTree.Node | undefined {
  return chainOf<TSESTree.Node>(node, typeWrapped).at(-1);
}

export function resolveConstant(context: SourceContext, node: MaybeNode, depth = 0): MaybeNode {
  const chain: MaybeNode[] = node ? [unwrapTypes(node)] : [node];
  for (const current of chain) {
    const next = constantInitializer(context, current, depth + chain.length - 1);
    if (next) {
      chain.push(unwrapTypes(next));
    }
  }
  return chain.at(-1);
}

export function resolveFunction(
  context: SourceContext,
  node: MaybeNode,
): FunctionNode | FunctionNameNode | undefined {
  if (node?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type === DefinitionType.FunctionName) {
    return definition.node;
  }
  if (definition?.type === DefinitionType.Variable && definition.parent.kind === 'const') {
    const init = definition.node.init;
    return isFunctionNode(init) ? init : undefined;
  }
  return undefined;
}

const NUMBER_OPERATORS: Readonly<Record<string, (left: number, right: number) => number>> = {
  '*': (left, right) => left * right,
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '/': (left, right) => left / right,
};

function operandNodes(node: MaybeNode): TSESTree.Node[] {
  if (node?.type === AST_NODE_TYPES.UnaryExpression && ['-', '+'].includes(node.operator)) {
    return [node.argument];
  }
  if (
    node?.type === AST_NODE_TYPES.BinaryExpression &&
    Object.hasOwn(NUMBER_OPERATORS, node.operator)
  ) {
    return [node.left, node.right];
  }
  return [];
}

function numericEntry(context: SourceContext, { node, depth, parent }: NumericEntry): NumericEntry {
  return {
    node: depth > MAX_RESOLVE_DEPTH ? undefined : resolveConstant(context, node),
    depth,
    parent,
  };
}

function numericEntries(context: SourceContext, root: MaybeNode, depth: number): NumericEntry[] {
  const entries = [numericEntry(context, { node: root, depth })];
  for (const entry of entries) {
    const operands = operandNodes(entry.node).map((node) => ({
      node,
      depth: entry.depth + 1,
      parent: entry,
    }));
    entries.push(...operands.map((operand) => numericEntry(context, operand)));
  }
  return entries;
}

function numericValue(
  node: MaybeNode,
  operands: readonly (number | undefined)[],
): number | undefined {
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'number') {
    return node.value;
  }
  const numbers = operands.filter((value) => value !== undefined);
  const [left, right] = numbers;
  if (left === undefined || numbers.length < operands.length) {
    return undefined;
  }
  if (node?.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator === '-' ? -left : left;
  }
  return node?.type === AST_NODE_TYPES.BinaryExpression && right !== undefined
    ? NUMBER_OPERATORS[node.operator]?.(left, right)
    : undefined;
}

export function constantNumber(
  context: SourceContext,
  node: MaybeNode,
  depth = 0,
): number | undefined {
  const entries = numericEntries(context, node, depth);
  const values = new Map<NumericEntry, number | undefined>();
  for (const entry of entries.toReversed()) {
    const operands = entries
      .filter(({ parent }) => parent === entry)
      .map((operand) => values.get(operand));
    values.set(entry, numericValue(entry.node, operands));
  }
  const [root] = entries;
  return root === undefined ? undefined : values.get(root);
}
