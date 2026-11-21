import type TypeScript from 'typescript';
import {
  bindPair as untypedBindPair,
  recordTypeHole as untypedRecordTypeHole,
  typePairProblem as untypedTypePairProblem,
} from '../../../../../../shared/fix/recipes/extract/bijection.mts';
import {
  declineNote as untypedDeclineNote,
  helperNameFor as untypedHelperNameFor,
  nameHoles as untypedNameHoles,
} from '../../../../../../shared/fix/recipes/extract/names.mts';
import {
  dedentedToLeast as untypedDedentedToLeast,
  indentedBy as untypedIndentedBy,
  withLineEndingOf as untypedWithLineEndingOf,
  withReplacements as untypedWithReplacements,
} from '../../../../../../shared/fix/recipes/extract/text.mts';
import { statementWindows as untypedStatementWindows } from '../../../../../../shared/fix/recipes/extract/windows.mts';
import type { ReplaceEdit } from '../../typed/project-types.mts';
import type { AlignEnv, Both, Extracted, Hole } from './extract-types.mts';

const bindPair: (
  env: AlignEnv,
  left: TypeScript.Symbol | undefined,
  right: TypeScript.Symbol | undefined,
) => boolean = untypedBindPair;

const declineNote: (
  finding: { readonly path: string; readonly line: number },
  reason: string,
) => string = untypedDeclineNote;

const nameHoles: <H extends object>(
  holes: readonly H[],
  taken: Iterable<string>,
  stemOf: (hole: H) => string | undefined,
) => (H & { readonly name: string })[] | undefined = untypedNameHoles;

const recordTypeHole: (
  holes: Map<string, Hole>,
  pair: [TypeScript.Node, TypeScript.Node],
  texts: readonly string[],
) => void = untypedRecordTypeHole;

const typePairProblem: (
  sites: Set<string>,
  pair: Both<TypeScript.Node>,
  walk: {
    readonly textOf: (node: TypeScript.Node) => string;
    readonly expand: (
      pair: Both<TypeScript.Node>,
      pending: Both<TypeScript.Node>[],
    ) => string | undefined;
  },
) => string | undefined = untypedTypePairProblem;

const helperNameFor: (label: string, taken: ReadonlySet<string>) => string | undefined =
  untypedHelperNameFor;

function withWidened(edits: readonly ReplaceEdit[], widened: readonly ReplaceEdit[]): Extracted {
  const same = edits.every((edit, index) => edit.text === widened[index]?.text);
  return same ? { edits } : { edits, widened };
}

const dedentedToLeast: (text: string) => string = untypedDedentedToLeast;
const withReplacements: (
  text: string,
  replacements: readonly { readonly start: number; readonly end: number; readonly text: string }[],
) => string = untypedWithReplacements;

const indentedBy: (text: string, prefix: string) => string = untypedIndentedBy;

const withLineEndingOf: (source: string, text: string) => string = untypedWithLineEndingOf;

const statementWindows: <T>(list: readonly T[]) => T[][] = untypedStatementWindows;

export {
  bindPair,
  declineNote,
  dedentedToLeast,
  withReplacements,
  helperNameFor,
  indentedBy,
  nameHoles,
  recordTypeHole,
  statementWindows,
  typePairProblem,
  withLineEndingOf,
  withWidened,
};
