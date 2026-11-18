import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf as untypedAncestorsOf,
  constantInitializer as untypedConstantInitializer,
  contains as untypedContains,
  outermostWrapper as untypedOutermostWrapper,
  scopeChain as untypedScopeChain,
  variableNamed as untypedVariableNamed,
} from '../analysis/ancestry.mjs';
import {
  chainOf as untypedChainOf,
  depthFirst as untypedDepthFirst,
  foldTree as untypedFoldTree,
  objectChildren as untypedObjectChildren,
} from '../../../../../../shared/traversal.mjs';

export type Ranged = { readonly range: readonly [number, number] };

export type SourceCode = Readonly<TSESLint.SourceCode>;
export type LibraryBinding = { readonly source: string; readonly name: string | undefined };
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

export function importedName(specifier: TSESTree.ImportClause): string | undefined {
  if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
    return undefined;
  }
  const { imported } = specifier;
  return imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value;
}

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
