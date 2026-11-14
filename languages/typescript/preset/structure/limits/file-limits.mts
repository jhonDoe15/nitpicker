import type { SizedFile } from '../typed/structure-types.mts';
import type { Finding } from '../../../adapters/static-checks/shared.mts';
import { collectFileLimitFindings, readHeadPolicy, readLayout } from '../typed/rule-views.mts';
import { typescriptFolderDepthFindings } from './folder-depth.mts';

export function typescriptFileLimitFindings(
  projectRoot: string,
  analyzerName: string,
  environment: NodeJS.ProcessEnv,
): Finding[] {
  const policy = readHeadPolicy(environment);
  const { thresholds, exceptions } = policy;
  const layout = readLayout(environment);
  const entries = layout.projectCodeFiles(projectRoot).map((file): SizedFile => ({
    path: file,
    kind: layout.isTestFile(file) ? 'test' : 'source',
  }));
  return [
    ...collectFileLimitFindings(projectRoot, entries, { analyzerName, thresholds, exceptions }),
    ...typescriptFolderDepthFindings(entries, { analyzerName, layout, policy }),
  ];
}
