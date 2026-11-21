import type { Node } from 'web-tree-sitter';
import {
  depthFirst as untypedDepthFirst,
  chainOf as untypedChainOf,
} from '../../../../shared/traversal.mts';
import {
  statementsOf as untypedStatementsOf,
  listOf as untypedListOf,
  uniqueNames as untypedUniqueNames,
  withSnippet as untypedWithSnippet,
} from '../../../../shared/near-duplicates/unit-parts.mts';
import type { BaseContext, Converted, PlacedNode, ShapeNode, Unit } from './jvm-types.mts';
import {
  indentOf as untypedIndentOf,
  dedentedToLeast as untypedDedentedToLeast,
  indentedBy as untypedIndentedBy,
  withLineEndingOf as untypedWithLineEndingOf,
  withReplacements as untypedWithReplacements,
} from '../../../../shared/fix/recipes/extract/text.mts';
import {
  lastSegment as untypedLastSegment,
  helperNameFor as untypedHelperNameFor,
  nameHoles as untypedNameHoles,
} from '../../../../shared/fix/recipes/extract/names.mts';
export { outcomeOf, collected } from '../../../../shared/fix/recipes/extract/outcomes.mts';
export {
  wholeCandidates,
  partialCandidates,
} from '../../../../shared/fix/recipes/extract/candidates.mts';
import { nearDuplicateMatches as untypedNearDuplicateMatches } from '../../../../shared/rules/near-duplicates/near-duplicates.mts';
import {
  bindPair as untypedBindPair,
  recordTypeHole as untypedRecordTypeHole,
  typePairProblem as untypedTypePairProblem,
} from '../../../../shared/fix/recipes/extract/bijection.mts';
import { statementWindows as untypedStatementWindows } from '../../../../shared/fix/recipes/extract/windows.mts';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mts';
import {
  isRealPathInside as untypedIsRealPathInside,
  readRealInside as untypedReadRealInside,
  resolveInside as untypedResolveInside,
} from '../../../../shared/conventions/read-inside.mts';
import type { AlignHole, BindingState, Matches } from './extract-types.mts';

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
export const placedWithSnippet: (node: PlacedNode, text: string) => PlacedNode = untypedWithSnippet;

const statementsOfUntyped: (
  source: Node | undefined,
  context: { readonly get: (source: Node | undefined) => Converted },
) => ShapeNode[] = untypedStatementsOf;

const listOfUntyped: (
  sources: readonly Node[],
  context: { readonly get: (source: Node | undefined) => Converted },
) => ShapeNode[] = untypedListOf;

export function statementsOf(source: Node | undefined, context: BaseContext): ShapeNode[] {
  return statementsOfUntyped(source, { get: context.raw });
}

export function listOf(sources: readonly Node[], context: Pick<BaseContext, 'raw'>): ShapeNode[] {
  return listOfUntyped(sources, { get: context.raw });
}

export const indentOf: (text: string, offset: number) => string = untypedIndentOf;
export const dedentedToLeast: (text: string) => string = untypedDedentedToLeast;
export const withReplacements: (
  text: string,
  replacements: readonly { readonly start: number; readonly end: number; readonly text: string }[],
) => string = untypedWithReplacements;
export const indentedBy: (text: string, prefix: string) => string = untypedIndentedBy;
export const withLineEndingOf: (source: string, text: string) => string = untypedWithLineEndingOf;

export const lastSegment: (label: string) => string = untypedLastSegment;
export const helperNameFor: (label: string, taken: ReadonlySet<string>) => string | undefined =
  untypedHelperNameFor;
export const nameHoles: <Hole extends object>(
  holes: readonly Hole[],
  taken: ReadonlySet<string>,
  stemOf: (hole: Hole) => string | undefined,
) => (Hole & { name: string })[] | undefined = untypedNameHoles;

export const nearDuplicateMatches: (
  units: readonly Unit[],
  options: { readonly isExcepted: () => boolean },
) => Matches = untypedNearDuplicateMatches;

export const bindPair: (state: BindingState, left: string, right: string) => boolean =
  untypedBindPair;
export const recordTypeHole: (
  holes: Map<string, AlignHole>,
  pair: [Node, Node],
  texts: readonly string[],
) => void = untypedRecordTypeHole;
export const typePairProblem: (
  sites: Set<string>,
  pair: readonly [Node, Node],
  options: {
    readonly textOf: (node: Node) => string;
    readonly expand: (
      pair: readonly [Node, Node],
      pending: (readonly [Node, Node])[],
    ) => string | undefined;
  },
) => string | undefined = untypedTypePairProblem;

export const statementWindows: <Item>(list: readonly Item[]) => Item[][] = untypedStatementWindows;

export const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
export const isRealPathInside: (root: string, full: string) => boolean = untypedIsRealPathInside;
export function readRealInside(
  root: string,
  relative: string,
  encoding: 'utf8',
): string | undefined {
  const content: unknown = untypedReadRealInside(root, relative, encoding);
  return typeof content === 'string' ? content : undefined;
}
export const resolveInside: (root: string, relative: string) => string | undefined =
  untypedResolveInside;

export function wordIn(name: string, texts: readonly string[], before: RegExp): boolean {
  const word = new RegExp(`${before.source}${escapeRegExp(name)}(?![\\w$])`, 'u');
  return texts.some((text) => word.test(text));
}
