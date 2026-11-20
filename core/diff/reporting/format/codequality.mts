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

function firstOfEachFingerprint(issues: readonly Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter(({ fingerprint }) => {
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
}

export function renderCodeQualityReport(
  findings: readonly ReportEntry[],
  { projectPath = '.' }: { readonly projectPath?: string | undefined } = {},
): string {
  const issues = firstOfEachFingerprint(findings.map((finding) => toIssue(finding, projectPath)));
  return `${JSON.stringify(issues, null, 2)}\n`;
}
