import { createHash } from 'node:crypto';
import { comparisonKey } from '../../comparison/fingerprint.mjs';
import { repositoryFindingPath, repositoryPath } from '../../git/paths.mjs';

export const CODE_QUALITY_REPORT_FILE_NAME = 'codequality.json';

function toIssue(finding, projectPath) {
  return {
    description: finding.message,
    check_name: `${finding.tool}/${finding.rule}`,
    fingerprint: createHash('sha256')
      .update(`${repositoryPath(projectPath)}\n${comparisonKey(finding)}`)
      .digest('hex'),
    severity: finding.classification === 'enforceable' ? 'major' : 'info',
    location: {
      path: repositoryFindingPath(projectPath, finding.path),
      lines: { begin: Math.max(finding.location?.line ?? 1, 1) },
    },
  };
}

function firstOfEachFingerprint(issues) {
  const seen = new Set();
  return issues.filter(({ fingerprint }) => {
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
}

export function renderCodeQualityReport(findings, { projectPath = '.' } = {}) {
  const issues = firstOfEachFingerprint(findings.map((finding) => toIssue(finding, projectPath)));
  return `${JSON.stringify(issues, null, 2)}\n`;
}
