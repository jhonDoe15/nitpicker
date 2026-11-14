import { coverageMetricFinding, normalizeReportPath } from '../../../../shared/ingest/common.mjs';

const BLOCK = /^(.+):\d+\.\d+,\d+\.\d+ (\d+) (\d+)$/;

const TOOL = 'go-cover';

type GoCoverOptions = { readonly modulePath?: string };
type FileTotals = { covered: number; total: number };

export function ingestGoCoverprofile(
  text: string,
  options: GoCoverOptions = {},
): { findings: ReturnType<typeof coverageMetricFinding>[] } {
  const findings: ReturnType<typeof coverageMetricFinding>[] = [];
  for (const [importPath, { covered, total }] of collectFileTotals(text)) {
    const filePath = normalizeReportPath(stripModule(importPath, options.modulePath));
    if (filePath !== undefined && total > 0) {
      findings.push(
        coverageMetricFinding({
          tool: TOOL,
          path: filePath,
          name: 'statement-coverage',
          covered,
          total,
        }),
      );
    }
  }
  return { findings };
}

function collectFileTotals(text: string): Map<string, FileTotals> {
  const files = new Map<string, FileTotals>();
  for (const rawLine of text.split(/\r?\n/)) {
    const match = BLOCK.exec(rawLine.trim());
    if (match === null) {
      continue;
    }
    const [, file = '', count, hits] = match;
    const statements = Number(count);
    const entry = files.get(file) ?? { covered: 0, total: 0 };
    entry.total += statements;
    entry.covered += Number(hits) > 0 ? statements : 0;
    files.set(file, entry);
  }
  return files;
}

function stripModule(importPath: string, modulePath: string | undefined): string {
  if (modulePath !== undefined && importPath.startsWith(`${modulePath}/`)) {
    return importPath.slice(modulePath.length + 1);
  }
  return importPath;
}
