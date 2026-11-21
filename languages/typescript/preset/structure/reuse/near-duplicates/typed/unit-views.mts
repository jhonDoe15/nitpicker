import type TypeScript from 'typescript';
import {
  listOf as untypedListOf,
  statementsOf as untypedStatementsOf,
  uniqueNames as untypedUniqueNames,
  withSnippet as untypedWithSnippet,
} from '../../../../../../../shared/near-duplicates/unit-parts.mts';
import type { Converted } from './tree-types.mts';

type Getter = { readonly get: (source: TypeScript.Node) => Converted };

export const statementsOf: (source: TypeScript.Node, context: Getter) => Converted[] =
  untypedStatementsOf;

export const listOf: (sources: readonly TypeScript.Node[], context: Getter) => Converted[] =
  untypedListOf;

export const uniqueNames: <Item extends { readonly name: string }>(
  units: readonly Item[],
) => Item[] = untypedUniqueNames;

export const withSnippet: (node: Converted, text: string) => Converted = untypedWithSnippet;
