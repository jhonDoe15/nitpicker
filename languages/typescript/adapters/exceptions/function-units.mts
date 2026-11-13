import type TypeScript from 'typescript';
import { functionUnits as untypedFunctionUnits } from '../../preset/structure/units/function-units.mjs';

export type FunctionUnit = {
  readonly name: string;
  readonly kind: string;
  readonly start: number;
  readonly end: number;
};

export type LineSpan = { readonly start?: number; readonly end?: number };

export type BranchSite = { readonly loc?: { readonly start?: { readonly line?: number } } };

export type FunctionIdentity = {
  readonly crapFunctionName: (entry: { readonly lines?: LineSpan }) => string | undefined;
  readonly branchFunctionNames: (
    branchMap: Readonly<Record<string, BranchSite>> | undefined,
  ) => Record<string, string | undefined>;
  readonly functionNameAtLine: (line: number | undefined) => string | undefined;
};

export const functionUnits: (sourceFile: TypeScript.SourceFile) => {
  readonly units: readonly FunctionUnit[];
} = untypedFunctionUnits;
