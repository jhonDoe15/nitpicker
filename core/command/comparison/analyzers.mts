import { selectAnalyzers as selectAll } from '../../diff/execution/run-analyzers.mts';
import { partialRunOf } from '../../diff/reporting/partial-run/partial-run.mts';
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

export function selectComparisonAnalyzers({ options, analyzers }: AnalyzerSelection): {
  readonly analyzers: readonly ProfiledAnalyzer[];
  readonly partialRun: unknown;
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
    partialRun: partialRunOf(options.analyzerNames, analyzers, selectedAnalyzers),
  };
}
