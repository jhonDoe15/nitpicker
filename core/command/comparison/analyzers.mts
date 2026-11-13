import { selectAnalyzers } from '../../diff/execution/run-analyzers.mjs';
import { partialRunOf } from '../../diff/reporting/partial-run/partial-run.mjs';
import { selectAnalyzerShard } from '../../diff/sharding/sharding.mjs';

type AnalyzerSelection = {
  readonly options: {
    readonly analyzerNames: readonly string[];
    readonly shardCount?: number | undefined;
    readonly shardIndex?: number | undefined;
  };
  readonly analyzers: unknown;
};

const runPartOf: (
  names: readonly string[],
  analyzers: unknown,
  selected: readonly unknown[],
) => unknown = partialRunOf;
const selectAll: (analyzers: unknown, names: readonly string[]) => readonly unknown[] =
  selectAnalyzers;
const selectShard: (
  analyzers: unknown,
  count: number,
  index: number | undefined,
) => readonly unknown[] | undefined = selectAnalyzerShard;

export function selectComparisonAnalyzers({ options, analyzers }: AnalyzerSelection): {
  readonly analyzers: readonly unknown[];
  readonly partialRun: unknown;
} {
  const selectedAnalyzers =
    options.shardCount === undefined
      ? selectAll(analyzers, options.analyzerNames)
      : (selectShard(analyzers, options.shardCount, options.shardIndex) ?? []);
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
