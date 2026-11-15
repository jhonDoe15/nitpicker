import type { Linter } from 'eslint';
import type { defaultResolvedLayout } from '../../layout.mjs';

export type ScopeLayout = {
  readonly sourceGlobs: string[];
  readonly testGlobs: string[];
  readonly excludedGlobs: string[];
  readonly sourceTestDirectoryGlobs: string[];
  readonly sourceRoots: string[];
  readonly testRoots: string[];
  readonly entryPoints?: string[];
};

export type StrictOptions = {
  readonly react?: true | undefined;
  readonly nest?: true | undefined;
  readonly frameworkDefaultExports?: string[];
  readonly detachedWorkRunners?: string[];
  readonly databaseWrites?: { readonly orms: readonly string[]; readonly opensTransactions: boolean };
  readonly routeAuth?: { readonly entries: readonly string[] };
  readonly softDeleteFilters?: { readonly orms: readonly string[]; readonly filters: readonly string[] };
};

type Selector = { readonly selector: string; readonly message: string };

export type RestrictedSyntax = Record<'configFile' | 'source' | 'domain' | 'adapters', Selector[]>;

export type ParserOptions = Linter.ParserOptions;

function isLinterConfig(entry: object): entry is Linter.Config {
  return !Array.isArray(entry);
}

export function linterConfigs(entries: readonly object[]): Linter.Config[] {
  return entries.filter(isLinterConfig);
}

export type I18nSettings = {
  readonly enabled?: unknown;
  readonly functionNames?: string[] | undefined;
  readonly componentNames?: string[] | undefined;
};

export type ReactScope = {
  readonly enabled?: unknown;
  readonly major?: number | undefined;
  readonly styling?: string | undefined;
  readonly autoCleanup?: unknown;
  readonly reactNative?: unknown;
  readonly nativeApp?: unknown;
};

export type ResolvedLayout = typeof defaultResolvedLayout;
