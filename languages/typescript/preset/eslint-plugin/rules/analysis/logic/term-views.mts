import { normalize as untypedNormalize } from '../../../../../../../shared/logic/normalize.mjs';
import { print as untypedPrint } from '../../../../../../../shared/logic/print.mjs';
import { isSideEffectFree as untypedIsSideEffectFree } from '../../../../../../../shared/logic/purity.mjs';
import {
  foldTerm as untypedFoldTerm,
  isLogical as untypedIsLogical,
  key as untypedKey,
  term as untypedTerm,
  withRange as untypedWithRange,
} from '../../../../../../../shared/logic/terms.mjs';

export type Range = readonly [number, number];

export type Term = {
  readonly kind: string;
  readonly value: string | undefined;
  readonly children: Term[];
  readonly range: Range | undefined;
  readonly loose?: true;
  readonly assignment?: true;
  readonly boolean?: true;
  readonly integer?: true;
};

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
