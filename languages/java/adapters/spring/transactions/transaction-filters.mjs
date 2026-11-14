import { withoutInheritedTransactions } from './inherited-transactions.mjs';
import { withoutReadOnlyReads } from './read-only/read-only-reads.mjs';
import { withoutTransactionAwareCacheWrites } from './transaction-aware.mjs';
import { withoutTransactionalCallers } from './transactional-callers.mjs';

export function springRoots({ allSourceRoots, manifest }) {
  return [
    ...(allSourceRoots ?? []),
    ...(manifest?.sourceRoots ?? []),
    ...(manifest?.kotlinSourceRoots ?? []),
  ];
}

export function withSpringTransactionFilters(findings, context) {
  const options = { projectRoot: context.projectRoot, roots: springRoots(context) };
  return withoutReadOnlyReads(
    withoutTransactionalCallers(
      withoutInheritedTransactions(withoutTransactionAwareCacheWrites(findings, options), options),
      options,
    ),
    options,
  );
}
