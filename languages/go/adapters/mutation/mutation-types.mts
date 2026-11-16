import type { CoverProfile, FindingRow } from '../go-types.mts';

export type Mutant = {
  readonly file: string;
  readonly function?: string | undefined;
  readonly operator: string;
  readonly original: string;
  readonly replacement: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number | undefined;
  readonly start: number;
  readonly end: number;
};
export type MutantResult = Mutant & {
  readonly status: string;
  readonly failing?: readonly string[];
};
export type ChangedResult = MutantResult & { readonly changed: boolean };
export type Packages = {
  readonly files: ReadonlyMap<string, string>;
  readonly tested: ReadonlySet<string>;
};
export type Baseline = {
  readonly failing: ReadonlySet<string>;
  readonly seconds: ReadonlyMap<string, number>;
  readonly profile: CoverProfile | undefined;
};
export type ChangedRange = readonly number[];
export type LineScope = {
  readonly all: boolean;
  readonly changed?: ReadonlyMap<string, readonly ChangedRange[]>;
};
export type Scope = Required<LineScope> & { readonly testedFolders: ReadonlySet<string> };
export type Tested = { readonly files: string[]; readonly capped: string[] };
export type Testers = ReadonlyMap<string, readonly string[]>;
export type MutationReport = {
  readonly results: readonly ChangedResult[];
  readonly weakened: readonly FindingRow[];
  readonly capped: readonly string[];
};
