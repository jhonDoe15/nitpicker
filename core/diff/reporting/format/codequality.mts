import { createHash } from 'node:crypto';
import { entryKey } from '../../comparison/fingerprint.mts';
import { repositoryFindingPath, repositoryPath } from '../../git/paths.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

type Issue = { readonly fingerprint: string; readonly [field: string]: unknown };

const projectPathOf: (projectPath: string) => string = repositoryPath;

export const CODE_QUALITY_REPORT_FILE_NAME = 'codequality.json';

function toIssue(finding: ReportEntry, projectPath: string): Issue {
  return {
    description: finding.message,
    check_name: `${textOf(finding.tool)}/${textOf(finding.rule)}`,
    fingerprint: createHash('sha256')
      .update(`${projectPathOf(projectPath)}\n${entryKey(finding)}`)
      .digest('hex'),
    severity: finding.classification === 'enforceable' ? 'major' : 'info',
    location: {
      path: repositoryFindingPath(projectPath, textOf(finding.path)),
      lines: { begin: Math.max(Number(fieldOf(finding['location'], 'line') ?? 1), 1) },
    },
  };
}

export function* eachCodeQualityIssue(
  findings: Iterable<ReportEntry>,
  { projectPath = '.' }: { readonly projectPath?: string | undefined } = {},
): Generator<Issue> {
  const seen = new Set<string>();
  for (const finding of findings) {
    const issue = toIssue(finding, projectPath);
    if (!seen.has(issue.fingerprint)) {
      seen.add(issue.fingerprint);
      yield issue;
    }
  }
}

function codeQualityIssues(
  findings: readonly ReportEntry[],
  options: { readonly projectPath?: string | undefined } = {},
): unknown[] {
  return [...eachCodeQualityIssue(findings, options)];
}

export function renderCodeQualityReport(
  findings: readonly ReportEntry[],
  options: { readonly projectPath?: string | undefined } = {},
): string {
  return `${JSON.stringify(codeQualityIssues(findings, options), null, 2)}\n`;
}
