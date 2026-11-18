import type { Linter } from 'eslint';

type DatabaseWrites = {
  readonly orms: readonly string[];
  readonly opensTransactions: boolean;
};
type SoftDeleteFilters = {
  readonly orms: readonly string[];
  readonly filters: readonly string[];
};
type RouteAuth = { readonly entries: readonly string[] };
export type LearnedOptions = {
  readonly databaseWrites: DatabaseWrites;
  readonly softDeleteFilters: SoftDeleteFilters;
  readonly routeAuth: RouteAuth;
};

export type LearnedConfig = {
  readonly databaseWrites?: DatabaseWrites | undefined;
  readonly softDeleteFilters?: SoftDeleteFilters | undefined;
  readonly routeAuth?: RouteAuth | undefined;
};

export function learnedRules({
  databaseWrites,
  softDeleteFilters,
  routeAuth,
}: LearnedOptions): Record<string, Linter.RuleEntry> {
  return {
    'nitpicker/no-unatomic-writes': ['error', databaseWrites],
    'nitpicker/no-check-then-write': ['error', databaseWrites],
    'nitpicker/no-unfiltered-soft-delete-read': ['error', softDeleteFilters],
    'nitpicker/no-route-without-auth': ['error', routeAuth],
  };
}

export function learnedOptions(options: LearnedConfig): LearnedOptions {
  return {
    databaseWrites: options.databaseWrites ?? { orms: [], opensTransactions: false },
    softDeleteFilters: options.softDeleteFilters ?? { orms: [], filters: [] },
    routeAuth: options.routeAuth ?? { entries: [] },
  };
}
