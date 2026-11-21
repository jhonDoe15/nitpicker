import type { Range, Term } from '../../../../../../../shared/logic/typed/term-types.mts';
import { normalize as untypedNormalize } from '../../../../../../../shared/logic/normalize.mts';
import { print as untypedPrint } from '../../../../../../../shared/logic/print.mts';
import { isSideEffectFree as untypedIsSideEffectFree } from '../../../../../../../shared/logic/purity.mts';
import {
  foldTerm as untypedFoldTerm,
  isLogical as untypedIsLogical,
  key as untypedKey,
  term as untypedTerm,
  withRange as untypedWithRange,
} from '../../../../../../../shared/logic/terms.mts';

export type { Range, Term };

export const key: (root: Term) => string = untypedKey;

export const print: (root: Term) => string = untypedPrint;

export const isSideEffectFree: (root: Term) => boolean = untypedIsSideEffectFree;

export const isLogical: (node: Term | undefined, operator: string) => boolean = untypedIsLogical;

export const foldTerm: <Result>(
  root: Term,
  combine: (node: Term, results: Result[]) => Result,
) => Result = untypedFoldTerm;

export const normalize: (
  node: Term,
  options: { readonly booleanContext: boolean },
) => { readonly term: Term; readonly key: string } = untypedNormalize;

export const term: (kind: string, value?: string, children?: Term[]) => Term = untypedTerm;

export const withRange: (node: Term, range: Range | undefined) => Term = untypedWithRange;
