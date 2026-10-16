import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { componentStoryFindings } from './component-stories.mjs';
import { typescriptFileLimitFindings } from './file-limits.mjs';
import { reuseFindings } from './reuse/reuse-findings.mjs';

export function typescriptStructureProjectFindings(
  { projectRoot, liveProjectRoot, analyzerName, snapshot, baselineRoot, baselinePaths },
  environment = process.env,
) {
  return [
    ...typescriptFileLimitFindings(projectRoot, analyzerName, environment),
    ...componentStoryFindings({
      projectRoot,
      liveProjectRoot,
      analyzerName,
      layout: readLayout(environment),
      exceptions: readHeadPolicy(environment).exceptions,
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
  ];
}
