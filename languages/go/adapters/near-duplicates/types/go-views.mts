import type { Node } from 'web-tree-sitter';
import type { Converted, ShapeNode } from '../../../../java/adapters/near-duplicates/jvm-types.mts';
import {
  chainOf as untypedChainOf,
  depthFirst as untypedDepthFirst,
} from '../../../../../shared/traversal.mjs';
import {
  listOf as untypedListOf,
  uniqueNames as untypedUniqueNames,
  withSnippet as untypedWithSnippet,
} from '../../../../../shared/near-duplicates/unit-parts.mjs';
import type { GoContext } from './go-types.mts';

export const depthFirst: <Item>(
  root: Item,
  children: (item: Item) => readonly Item[],
) => Iterable<Item> = untypedDepthFirst;

export const chainOf: <Item>(
  start: Item | undefined,
  next: (item: Item) => Item | undefined,
) => Item[] = untypedChainOf;

export const uniqueNames: <Item extends { readonly name: string }>(
  units: readonly Item[],
) => Item[] = untypedUniqueNames;

export const withSnippet: (node: Converted, text: string) => Converted = untypedWithSnippet;

const listOfUntyped: (
  sources: readonly Node[],
  context: { readonly get: (source: Node | undefined) => Converted },
) => ShapeNode[] = untypedListOf;

export function listOf(sources: readonly Node[], context: GoContext): ShapeNode[] {
  return listOfUntyped(sources, { get: context.raw });
}
