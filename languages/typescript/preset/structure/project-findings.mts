import type { Finding } from '../../adapters/static-checks/shared.mts';
import { readHeadPolicy, readLayout, reuseFindings } from './typed/rule-views.mts';
import { typescriptClassLimitFindings } from './classes/class-limit-findings.mts';
import { componentStoryFindings } from './component-stories.mts';
import { typescriptFileLimitFindings } from './limits/file-limits.mts';
import { javascriptFileFindings } from './sources/javascript-files.mts';
import { uncollectedWorkspaceTestFindings } from './workspace-tests.mts';

export function typescriptStructureProjectFindings(
  {
    projectRoot,
    liveProjectRoot,
    analyzerName,
    snapshot,
    baselineRoot,
    baselinePaths,
  }: {
    readonly projectRoot: string;
    readonly liveProjectRoot?: string | undefined;
    readonly analyzerName: string;
    readonly snapshot: string;
    readonly baselineRoot?: string | undefined;
    readonly baselinePaths?: unknown;
  },
  environment: NodeJS.ProcessEnv = process.env,
): Finding[] {
  const layout = readLayout(environment);
  const policy = readHeadPolicy(environment);
  return [
    ...typescriptFileLimitFindings(projectRoot, analyzerName, environment),
    ...typescriptClassLimitFindings(projectRoot, analyzerName, environment),
    ...javascriptFileFindings({ projectRoot, liveProjectRoot, analyzerName, layout, policy }),
    ...componentStoryFindings({
      projectRoot,
      liveProjectRoot,
      analyzerName,
      layout,
      exceptions: policy.exceptions,
    }),
    ...reuseFindings(
      {
        projectRoot,
        analyzerName,
        baselineRoot: snapshot === 'head' ? baselineRoot : undefined,
        baselinePaths,
      },
      environment,
    ),
    ...uncollectedWorkspaceTestFindings(projectRoot, {
      analyzerName,
      exceptions: policy.exceptions,
    }),
  ];
}
