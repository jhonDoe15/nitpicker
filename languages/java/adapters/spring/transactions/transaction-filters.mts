import { withoutInheritedTransactions } from './inherited-transactions.mts';
import { withoutReadOnlyReads } from './read-only/read-only-reads.mts';
import { withoutTransactionAwareCacheWrites } from './transaction-aware.mts';
import { withoutTransactionalCallers } from './transactional-callers.mts';
import type { JavaFinding } from '../../typed/java-values.mts';
import type { RootsContext, RootsInput } from './transaction-types.mts';

export function springRoots({ allSourceRoots, manifest }: RootsInput): string[] {
  return [
    ...(allSourceRoots ?? []),
    ...(manifest?.sourceRoots ?? []),
    ...(manifest?.kotlinSourceRoots ?? []),
  ];
}

export function withSpringTransactionFilters<T extends JavaFinding>(
  findings: T[],
  context: RootsContext,
): T[] {
  const options = { projectRoot: context.projectRoot, roots: springRoots(context) };
  return withoutReadOnlyReads(
    withoutTransactionalCallers(
      withoutInheritedTransactions(withoutTransactionAwareCacheWrites(findings, options), options),
      options,
    ),
    options,
  );
}
