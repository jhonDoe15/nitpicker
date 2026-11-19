import { selectAnalyzers as selectAll } from '../../diff/execution/run-analyzers.mts';
import { partialRunOf } from '../../diff/reporting/partial-run/partial-run.mts';
import { selectAnalyzerShard } from '../../diff/sharding/sharding.mts';
import type { ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';

type SelectionOptions = {
  readonly analyzerNames: readonly string[];
  readonly shardCount?: number | undefined;
  readonly shardIndex?: number | undefined;
  readonly all: boolean;
};

type AnalyzerSelection = {
  readonly options: SelectionOptions;
  readonly analyzers: readonly ProfiledAnalyzer[];
};

export function requestedAnalyzers(
  options: SelectionOptions,
  analyzers: readonly ProfiledAnalyzer[],
): readonly ProfiledAnalyzer[] {
  return options.shardCount === undefined || options.shardIndex === undefined || options.all
    ? selectAll(analyzers, options.analyzerNames)
    : selectAnalyzerShard(analyzers, options.shardCount, options.shardIndex);
}

export function selectComparisonAnalyzers({ options, analyzers }: AnalyzerSelection): {
  readonly analyzers: readonly ProfiledAnalyzer[];
  readonly runFields: object;
} {
  const selectedAnalyzers = requestedAnalyzers(options, analyzers);
  if (selectedAnalyzers.length === 0) {
    throw new Error(
      'No quality analyzers are configured. The comparison framework is ready, but real analyzer adapters are a later phase.',
    );
  }
  return {
    analyzers: selectedAnalyzers,
    runFields: {
      partialRun: partialRunOf(options.analyzerNames, analyzers, selectedAnalyzers),
      sharded: options.shardCount !== undefined,
    },
  };
}
