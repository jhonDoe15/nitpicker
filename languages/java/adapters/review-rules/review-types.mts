import type { SourceFile } from './max-value-sums/sum-types.mts';

export type SourceProject = {
  readonly sourceRoots?: readonly string[] | undefined;
  readonly testSourceRoots?: readonly string[] | undefined;
  readonly kotlinSourceRoots?: readonly string[] | undefined;
  readonly kotlinTestSourceRoots?: readonly string[] | undefined;
  readonly kotlinExcludedFiles?: readonly string[] | undefined;
};

export type SourceListing = {
  readonly skipped: ReadonlySet<string> | undefined;
  readonly includeIgnored: boolean;
};

export type StaticImport = { readonly owner: string; readonly name: string };

export type SourceLocation = { readonly line: number; readonly column?: number | undefined };

export type DepthChanges = Readonly<Record<string, number | undefined>>;

export type QueryProblem = {
  readonly kind: string;
  readonly snippet?: string | undefined;
  readonly columns?: number | undefined;
  readonly values?: number | undefined;
};

export type MinedItem = {
  readonly line: number;
  readonly symbol: string;
  readonly key: string;
  readonly kind?: string;
  readonly casing?: string;
  readonly collection?: string;
  readonly name?: string;
  readonly checked?: string;
  readonly named?: string;
  readonly problem?: QueryProblem;
};

export type MinedRule = {
  readonly id: string;
  readonly find: (source: SourceFile) => MinedItem[];
  readonly message: (item: MinedItem, kotlin: boolean) => string;
};
