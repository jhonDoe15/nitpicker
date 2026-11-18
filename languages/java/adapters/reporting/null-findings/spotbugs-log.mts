import { fieldOf, fieldsOf, listOf } from '../../../../../shared/values/readers.mts';
import type { IndexRoots } from '../source-facts/source-index.mts';
import { withoutNeverReturningNulls } from './never-returns.mts';
import { withoutBoundFields } from './unwritten-fields.mts';

export function withoutSourceBackedSpotbugs(log: unknown, roots: IndexRoots): unknown {
  return {
    ...fieldsOf(log),
    runs: listOf(fieldOf(log, 'runs')).map((run) => ({
      ...fieldsOf(run),
      results: withoutBoundFields(
        withoutNeverReturningNulls(listOf(fieldOf(run, 'results')), roots),
        roots,
      ),
    })),
  };
}
