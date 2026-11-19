import type TypeScript from 'typescript';

export type ModuleAlias = { readonly find: string | RegExp; readonly replacement: string };

export type ModuleResolution = {
  readonly kind: 'ignored' | 'file' | 'package';
  readonly name?: string;
  readonly path?: string;
};

export type ResolveOptions = { readonly aliases?: readonly ModuleAlias[] | undefined };

export type ModuleResolver = {
  readonly options: TypeScript.CompilerOptions;
  readonly cache: TypeScript.ModuleResolutionCache;
  readonly pathPatterns: ((specifier: string) => boolean)[];
  readonly hasBaseUrl: boolean;
};

export type ReachLimits = {
  readonly maxDepth: number;
  readonly maxFiles: number;
  readonly aliases?: readonly ModuleAlias[];
};

export type ReachStep =
  | { readonly file: string; readonly depth: number; readonly from: string }
  | { readonly truncated: true };

export type ModuleReference = {
  readonly source: string;
  readonly runtime: boolean;
  readonly reexport: boolean;
};

export type StampedEntry<Value> = { readonly stamp: string; readonly value: Value };

export type EntryFile = { readonly file: string; readonly label: string };

export type ProductionOptions = {
  readonly importers: readonly string[];
  readonly entries?: readonly EntryFile[];
};

export type SelectedProjectLayout = {
  readonly typescriptProject: string;
  readonly exclude: readonly string[];
};
