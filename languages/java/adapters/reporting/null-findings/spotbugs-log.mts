import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import type { IndexRoots } from '../source-facts/source-index.mts';
import { withoutNeverReturningNulls } from './never-returns.mts';

export function withoutSourceBackedSpotbugs(log: unknown, roots: IndexRoots): unknown {
  return {
    ...Object(log),
    runs: listOf(fieldOf(log, 'runs')).map((run) => ({
      ...Object(run),
      results: withoutNeverReturningNulls(listOf(fieldOf(run, 'results')), roots),
    })),
  };
}
