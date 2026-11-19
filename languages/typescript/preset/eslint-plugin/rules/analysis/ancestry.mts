import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { isVariableDefinition } from '../../../syntax/kinds/node-kinds.mts';
import { chainOf as untypedChainOf } from '../../../../../../shared/traversal.mjs';

const chainOf: <Item>(
  start: Item | undefined,
  next: (current: Item) => Item | undefined,
) => Item[] = untypedChainOf;

type Ranged = { readonly range: readonly [number, number] };

export function contains(outer: Ranged, inner: Ranged): boolean {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

export function ancestorsOf(node: TSESTree.Node): TSESTree.Node[] {
  return chainOf(node.parent, (current) => current.parent);
}

export function outermostWrapper(
  node: TSESTree.Node,
  wrapperTypes: ReadonlySet<string>,
): TSESTree.Node {
  return (
    chainOf(node, (current) =>
      current.parent !== undefined && wrapperTypes.has(current.parent.type)
        ? current.parent
        : undefined,
    ).at(-1) ?? node
  );
}

export function scopeChain(scope: TSESLint.Scope.Scope): TSESLint.Scope.Scope[] {
  return chainOf(scope, (current) => current.upper ?? undefined);
}

export function variableNamed(
  sourceCode: Readonly<TSESLint.SourceCode>,
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): TSESLint.Scope.Variable | undefined {
  return scopeChain(sourceCode.getScope(identifier))
    .map((scope) => scope.set.get(identifier.name))
    .find((variable) => variable !== undefined);
}

export function constantInitializer(
  sourceCode: Readonly<TSESLint.SourceCode>,
  identifier: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  return isVariableDefinition(definition) && definition.parent.kind === 'const'
    ? (definition.node.init ?? undefined)
    : undefined;
}
