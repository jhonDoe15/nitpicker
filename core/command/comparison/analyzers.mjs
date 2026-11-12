import { selectAnalyzers } from '../../diff/execution/run-analyzers.mjs';
import { partialRunOf } from '../../diff/reporting/partial-run/partial-run.mjs';
import { selectAnalyzerShard } from '../../diff/sharding/sharding.mjs';

export function requestedAnalyzers(options, analyzers) {
  return options.shardCount === undefined || options.all
    ? selectAnalyzers(analyzers, options.analyzerNames)
    : selectAnalyzerShard(analyzers, options.shardCount, options.shardIndex);
}

export function selectComparisonAnalyzers({ options, analyzers }) {
  const selectedAnalyzers = requestedAnalyzers(options, analyzers);
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
