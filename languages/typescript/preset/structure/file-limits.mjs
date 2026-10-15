import { collectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { typescriptFolderDepthFindings } from './folder-depth.mjs';

export function typescriptFileLimitFindings(projectRoot, analyzerName, environment = process.env) {
  const policy = readHeadPolicy(environment);
  const { thresholds, exceptions } = policy;
  const layout = readLayout(environment);
  const entries = layout.projectCodeFiles(projectRoot).map((file) => ({
    path: file,
    kind: layout.isTestFile(file) ? 'test' : 'source',
  }));
  return [
    ...collectFileLimitFindings(projectRoot, entries, { analyzerName, thresholds, exceptions }),
    ...typescriptFolderDepthFindings(entries, { analyzerName, layout, policy }),
  ];
}
