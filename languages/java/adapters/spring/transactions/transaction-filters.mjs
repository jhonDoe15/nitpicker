import { withoutInheritedTransactions } from './inherited-transactions.mjs';
import { withoutTransactionAwareCacheWrites } from './transaction-aware.mjs';

export function springRoots({ allSourceRoots, manifest }) {
  return [
    ...(allSourceRoots ?? []),
    ...(manifest?.sourceRoots ?? []),
    ...(manifest?.kotlinSourceRoots ?? []),
  ];
}

export function withSpringTransactionFilters(findings, context) {
  const options = { projectRoot: context.projectRoot, roots: springRoots(context) };
  return withoutInheritedTransactions(
    withoutTransactionAwareCacheWrites(findings, options),
    options,
  );
}
