import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, nodeChildren, scopeChain, type SourceCode } from '../../typed/node-views.mts';

export type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
export type NonRoot = Exclude<TSESTree.Node, TSESTree.Program>;
type Wrapper =
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.ChainExpression;
const { DefinitionType, ScopeType } = TSESLint.Scope;
const DISPOSE = 'dispose';
const CLOSE_NAMES = new Set<string>([
  'close',
  DISPOSE,
  'destroy',
  'shutdown',
  'stop',
  'teardown',
  'disconnect',
  'end',
  'onModuleDestroy',
  'onApplicationShutdown',
  'beforeApplicationShutdown',
]);
const SYMBOL_DISPOSERS: Readonly<Record<string, string>> = {
  dispose: DISPOSE,
  asyncDispose: DISPOSE,
};
function isWrapper(node: TSESTree.Node): node is Wrapper {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.ChainExpression
  );
}

export function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

export function unwrapExpression(node: TSESTree.Node): TSESTree.Node {
  return chainEnd(node, (current) => (isWrapper(current) ? current.expression : undefined));
}

export function chainEnd<Item>(start: Item, next: (current: Item) => Item | undefined): Item {
  const chain = [start];
  for (const current of chain) {
    const following = next(current);
    if (following !== undefined) {
      chain.push(following);
    }
  }
  return chain.at(-1) ?? start;
}

function keyName(key: TSESTree.Node, computed: boolean): string | undefined {
  if (key.type === AST_NODE_TYPES.Identifier && !computed) {
    return key.name;
  }
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  if (key.type === AST_NODE_TYPES.MemberExpression && nameOf(key.object) === 'Symbol') {
    return SYMBOL_DISPOSERS[nameOf(key.property) ?? ''];
  }
  return undefined;
}

export function functionName(fn: FunctionNode): string | undefined {
  if (fn.id) {
    return fn.id.name;
  }
  const { parent } = fn;
  if (
    parent.type === AST_NODE_TYPES.MethodDefinition ||
    parent.type === AST_NODE_TYPES.Property ||
    parent.type === AST_NODE_TYPES.PropertyDefinition
  ) {
    return parent.value === fn ? keyName(parent.key, parent.computed) : undefined;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === fn) {
    return nameOf(parent.id);
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === fn) {
    return (
      nameOf(parent.left) ??
      (parent.left.type === AST_NODE_TYPES.MemberExpression
        ? nameOf(parent.left.property)
        : undefined)
    );
  }
  return undefined;
}

export function isCloseName(name: string | undefined): boolean {
  return name !== undefined && CLOSE_NAMES.has(name);
}

export function astChildren(node: TSESTree.Node): TSESTree.Node[] {
  return nodeChildren(node);
}

export function longLivedVariable(
  sourceCode: SourceCode,
  at: TSESTree.Node,
  name: string,
): TSESLint.Scope.Variable | undefined {
  const variable = scopeChain(sourceCode.getScope(at))
    .map((scope) => scope.set.get(name))
    .find((found) => found !== undefined);
  const declared = variable?.defs.every(
    (definition) => definition.type === DefinitionType.Variable,
  );
  const type = variable?.scope.type;
  const long =
    type === ScopeType.function || type === ScopeType.module || type === ScopeType.global;
  return declared === true && long ? variable : undefined;
}
