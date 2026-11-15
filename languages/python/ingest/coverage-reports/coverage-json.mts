import { coverageMetricFinding, uncoveredFinding } from '../../../../shared/ingest/common.mjs';
import { reportedPath } from './coverage-paths.mts';
import type { FindingsResult, IngestedFinding, IngestOptions } from '../typed/ingest-types.mts';
import { fieldOf, parseJson } from '../../../../shared/values/readers.mts';
import { isFileTable } from '../typed/coverage-types.mts';
import type { CoverageFileData, CoverageFunctionData } from '../typed/coverage-types.mts';

export function ingestCoverageJson(text: string, options: IngestOptions = {}): FindingsResult {
  const tool = options.tool ?? 'coverage';
  const files = fieldOf(parseJson(text), 'files');
  if (!isFileTable(files)) {
    throw new TypeError('coverage.py JSON report must contain a files object');
  }
  const roots = options.roots ?? [undefined];
  const findings = Object.entries<CoverageFileData>(files).flatMap(([file, data]) => {
    const filePath = reportedPath(file, roots);
    return filePath === undefined ? [] : fileFindings({ tool, path: filePath, data });
  });
  return { findings };
}

function fileFindings({
  tool,
  path,
  data,
}: {
  tool: string;
  path: string;
  data: CoverageFileData;
}): IngestedFinding[] {
  const statements = data.summary?.num_statements ?? 0;
  const metric =
    statements > 0
      ? [
          coverageMetricFinding({
            tool,
            path,
            name: 'line-coverage',
            covered: data.summary?.covered_lines,
            total: statements,
          }),
        ]
      : [];
  const uncovered = Object.entries(data.functions ?? {})
    .filter(([name, entry]) => name !== '' && isNeverRun(entry))
    .map(([name]) =>
      uncoveredFinding({
        tool,
        rule: 'uncovered-function',
        path,
        symbol: name,
        message: `Function ${name} is not covered`,
      }),
    );
  return [...metric, ...uncovered];
}

function isNeverRun(entry: CoverageFunctionData): boolean {
  return (entry.summary?.num_statements ?? 0) > 0 && entry.summary?.covered_lines === 0;
}
