import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { componentStoryFindings } from './component-stories.mjs';
import { typescriptFileLimitFindings } from './limits/file-limits.mjs';
import { javascriptFileFindings } from './sources/javascript-files.mjs';
import { reuseFindings } from './reuse/reuse-findings.mjs';

export function typescriptStructureProjectFindings(
  { projectRoot, liveProjectRoot, analyzerName },
  environment = process.env,
) {
  const layout = readLayout(environment);
  const policy = readHeadPolicy(environment);
  return [
    ...typescriptFileLimitFindings(projectRoot, analyzerName, environment),
    ...javascriptFileFindings({ projectRoot, liveProjectRoot, analyzerName, layout, policy }),
    ...componentStoryFindings({
      projectRoot,
      liveProjectRoot,
      analyzerName,
      layout,
      exceptions: policy.exceptions,
    }),
    ...reuseFindings(projectRoot, analyzerName, environment),
  ];
}
