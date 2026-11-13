import { selectAnalyzers } from '../../diff/execution/run-analyzers.mjs';
import { partialRunOf } from '../../diff/reporting/partial-run/partial-run.mjs';
import { selectAnalyzerShard } from '../../diff/sharding/sharding.mts';
import type { ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';

type AnalyzerSelection = {
  readonly options: {
    readonly analyzerNames: readonly string[];
    readonly shardCount?: number | undefined;
    readonly shardIndex?: number | undefined;
  };
  readonly analyzers: readonly ProfiledAnalyzer[];
};

const runPartOf: (
  names: readonly string[],
  analyzers: unknown,
  selected: readonly unknown[],
) => unknown = partialRunOf;
const selectAll: (analyzers: unknown, names: readonly string[]) => readonly unknown[] =
  selectAnalyzers;

export function selectComparisonAnalyzers({ options, analyzers }: AnalyzerSelection): {
  readonly analyzers: readonly unknown[];
  readonly runFields: object;
} {
  const selectedAnalyzers =
    options.shardCount === undefined || options.shardIndex === undefined
      ? selectAll(analyzers, options.analyzerNames)
      : selectAnalyzerShard(analyzers, options.shardCount, options.shardIndex);
  if (selectedAnalyzers.length === 0) {
    throw new Error(
      'No quality analyzers are configured. The comparison framework is ready, but real analyzer adapters are a later phase.',
    );
  }
  return {
    analyzers: selectedAnalyzers,
    runFields: {
      partialRun: runPartOf(options.analyzerNames, analyzers, selectedAnalyzers),
      sharded: options.shardCount !== undefined,
    },
  };
}
