import { selectAnalyzers } from '../../diff/execution/run-analyzers.mjs';
import { partialRunOf } from '../../diff/reporting/partial-run/partial-run.mjs';
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

const runPartOf: (
  names: readonly string[],
  analyzers: unknown,
  selected: readonly unknown[],
) => unknown = partialRunOf;
const selectAll: (analyzers: unknown, names: readonly string[]) => readonly unknown[] =
  selectAnalyzers;

export function requestedAnalyzers(
  options: SelectionOptions,
  analyzers: readonly ProfiledAnalyzer[],
): readonly unknown[] {
  return options.shardCount === undefined ||
    options.shardIndex === undefined ||
    options.all
    ? selectAll(analyzers, options.analyzerNames)
    : selectAnalyzerShard(analyzers, options.shardCount, options.shardIndex);
}

export function selectComparisonAnalyzers({ options, analyzers }: AnalyzerSelection): {
  readonly analyzers: readonly unknown[];
  readonly partialRun: unknown;
} {
  const selectedAnalyzers = requestedAnalyzers(options, analyzers);
  if (selectedAnalyzers.length === 0) {
    throw new Error(
      'No quality analyzers are configured. The comparison framework is ready, but real analyzer adapters are a later phase.',
    );
  }
  return {
    analyzers: selectedAnalyzers,
    partialRun: runPartOf(options.analyzerNames, analyzers, selectedAnalyzers),
  };
}
