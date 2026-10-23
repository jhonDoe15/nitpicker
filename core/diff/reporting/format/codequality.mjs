import { createHash } from 'node:crypto';
import { comparisonKey } from '../../comparison/fingerprint.mjs';
import { joinRepositoryPath, repositoryPath } from '../../git/paths.mjs';

export const CODE_QUALITY_REPORT_FILE_NAME = 'codequality.json';

function locationPath(finding, projectDirectory) {
  if (finding.path === '') {
    return projectDirectory === '' ? '.' : projectDirectory;
  }
  return joinRepositoryPath(projectDirectory, finding.path);
}

function toIssue(finding, projectDirectory) {
  return {
    description: finding.message,
    check_name: `${finding.tool}/${finding.rule}`,
    fingerprint: createHash('sha256')
      .update(`${projectDirectory}\n${comparisonKey(finding)}`)
      .digest('hex'),
    severity: finding.classification === 'enforceable' ? 'major' : 'info',
    location: {
      path: locationPath(finding, projectDirectory),
      lines: { begin: finding.location?.line ?? 1 },
    },
  };
}

export function renderCodeQualityReport(findings, { projectPath = '.' } = {}) {
  const projectDirectory = repositoryPath(projectPath);
  return `${JSON.stringify(
    findings.map((finding) => toIssue(finding, projectDirectory)),
    null,
    2,
  )}\n`;
}
