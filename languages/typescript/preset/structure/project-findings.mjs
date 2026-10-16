import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { componentStoryFindings } from './component-stories.mjs';
import { typescriptFileLimitFindings } from './file-limits.mjs';

export function typescriptStructureProjectFindings(
  { projectRoot, liveProjectRoot, analyzerName },
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
  ];
}
