import { collectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';

export function typescriptFileLimitFindings(projectRoot, analyzerName, environment = process.env) {
  const { thresholds, exceptions } = readHeadPolicy(environment);
  const layout = readLayout(environment);
  const entries = layout.projectCodeFiles(projectRoot).map((file) => ({
    path: file,
    kind: layout.isTestFile(file) ? 'test' : 'source',
  }));
  return collectFileLimitFindings(projectRoot, entries, { analyzerName, thresholds, exceptions });
}
