import { selectAnalyzers } from '../diff/execution/run-analyzers.mjs';
import { partialRunOf } from '../diff/reporting/partial-run/partial-run.mjs';
import { selectAnalyzerShard } from '../diff/sharding/sharding.mjs';

export function selectComparisonAnalyzers({ options, analyzers }) {
  const selectedAnalyzers =
    options.shardCount === undefined
      ? selectAnalyzers(analyzers, options.analyzerNames)
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
