import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf as untypedAncestorsOf,
  constantInitializer as untypedConstantInitializer,
  contains as untypedContains,
  outermostWrapper as untypedOutermostWrapper,
  scopeChain as untypedScopeChain,
  variableNamed as untypedVariableNamed,
} from '../analysis/ancestry.mts';
import {
  chainOf as untypedChainOf,
  depthFirst as untypedDepthFirst,
  foldTree as untypedFoldTree,
  objectChildren as untypedObjectChildren,
} from '../../../../../../shared/traversal.mts';

export type Ranged = { readonly range: readonly [number, number] };

export type SourceCode = Readonly<TSESLint.SourceCode>;
export type FileContext = { readonly sourceCode: SourceCode; readonly filename: string };
export type LibraryBinding = { readonly source: string; readonly name: string | undefined };

export function stringSourceBinding(
  binding: { readonly source: unknown; readonly name: string | undefined } | undefined,
): LibraryBinding | undefined {
  return typeof binding?.source === 'string'
    ? { source: binding.source, name: binding.name }
    : undefined;
}
export type VisitorKeys = SourceCode['visitorKeys'];

export type FoldSteps<Item, Context, Result> = {
  readonly expand: (node: Item, context: Context) => readonly (readonly [Item, Context])[];
  readonly combine: (node: Item, context: Context, results: Result[]) => Result;
};

export const chainOf: <Item>(
  start: Item | undefined,
  next: (current: Item) => Item | undefined,
) => Item[] = untypedChainOf;

export const depthFirst: <Item>(
  root: Item,
  children: (item: Item) => readonly Item[],
) => Iterable<Item> = untypedDepthFirst;

export const foldTree: <Item, Context, Result>(
  root: Item,
  context: Context,
  steps: FoldSteps<Item, Context, Result>,
) => Result = untypedFoldTree;

export const objectChildren: (node: unknown) => object[] = untypedObjectChildren;

export const ancestorsOf: (node: TSESTree.Node) => TSESTree.Node[] = untypedAncestorsOf;

export const contains: (outer: Ranged, inner: Ranged) => boolean = untypedContains;

export const outermostWrapper: (
  node: TSESTree.Node,
  wrapperTypes: ReadonlySet<string>,
) => TSESTree.Node = untypedOutermostWrapper;

export const scopeChain: (scope: TSESLint.Scope.Scope) => TSESLint.Scope.Scope[] =
  untypedScopeChain;

export const variableNamed: (
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
) => TSESLint.Scope.Variable | undefined = untypedVariableNamed;

export const constantInitializer: (
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
) => TSESTree.Expression | undefined = untypedConstantInitializer;

export function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

export function nodeChildren(node: unknown): TSESTree.Node[] {
  return objectChildren(node).filter(isNode);
}

export function nodesWithoutNested(
  root: TSESTree.Node,
  nested: ReadonlySet<string>,
  children: (node: TSESTree.Node) => readonly TSESTree.Node[],
): TSESTree.Node[] {
  return [
    ...depthFirst<TSESTree.Node>(root, (node) =>
      node !== root && nested.has(node.type) ? [] : children(node),
    ),
  ];
}

export function isIdentifierNamed(node: TSESTree.Node, name: string): node is TSESTree.Identifier {
  return node.type === AST_NODE_TYPES.Identifier && node.name === name;
}

export function nameOf(node: unknown): string | undefined {
  return isNode(node) && 'name' in node && typeof node.name === 'string' ? node.name : undefined;
}

export function requiredLiteral(
  init: TSESTree.Node | undefined,
): TSESTree.Literal['value'] | undefined {
  if (
    init?.type !== AST_NODE_TYPES.CallExpression ||
    init.callee.type !== AST_NODE_TYPES.Identifier ||
    init.callee.name !== 'require'
  ) {
    return undefined;
  }
  const [first] = init.arguments;
  return first?.type === AST_NODE_TYPES.Literal ? first.value : undefined;
}

export function plainText(node: TSESTree.Node, sourceCode: SourceCode): string {
  return sourceCode.getText(node).replaceAll('?.', '.').replaceAll('!', '');
}

export function concatOperands(plain: TSESTree.Node): readonly TSESTree.Node[] | undefined {
  if (plain.type === AST_NODE_TYPES.TemplateLiteral) {
    return plain.expressions;
  }
  if (plain.type === AST_NODE_TYPES.BinaryExpression) {
    return plain.operator === '+' ? [plain.left, plain.right] : [];
  }
  return undefined;
}

export function memberRoot(start: TSESTree.Node): TSESTree.Node {
  const chain = chainOf<TSESTree.Node>(start, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  );
  return chain.at(-1) ?? start;
}

export type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

export function functionBinding(fn: FunctionNode): TSESTree.Identifier | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id ?? undefined;
  }
  const { parent } = fn;
  return parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
    ? parent.id
    : undefined;
}

export function isPlainString(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0)
  );
}

type SoleStatement = 'ReturnStatement' | 'ExpressionStatement';

export function soleBodyValue(
  fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
  statement: SoleStatement,
): TSESTree.Node | undefined {
  const { body } = fn;
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return body;
  }
  const [only] = body.body;
  if (body.body.length !== 1) {
    return undefined;
  }
  if (only?.type === AST_NODE_TYPES.ReturnStatement && statement === 'ReturnStatement') {
    return only.argument ?? undefined;
  }
  if (only?.type === AST_NODE_TYPES.ExpressionStatement && statement === 'ExpressionStatement') {
    return only.expression;
  }
  return undefined;
}

export function compositeOperands(value: TSESTree.Node): TSESTree.Node[] | undefined {
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.expressions;
  }
  return value.type === AST_NODE_TYPES.BinaryExpression ? [value.left, value.right] : undefined;
}

export function nameText(node: TSESTree.Identifier | TSESTree.StringLiteral): string {
  return node.type === AST_NODE_TYPES.Identifier ? node.name : node.value;
}

export function unwrapAwait(node: TSESTree.Node | undefined): TSESTree.Node | undefined {
  return node?.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
}
