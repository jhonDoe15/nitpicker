import { configureAnalyzers } from '../../configuration/configure-analyzers.mjs';
import { withProjectTestFiles } from '../../../languages/typescript/preset/test-runner/test-files/project-test-files.mjs';

export function configuredWithTestFiles({
  presetSet,
  config,
  detectedPolicy,
  projectRoot,
  select,
}) {
  const headPolicy = withProjectTestFiles(detectedPolicy, {
    projectRoot,
    liveProjectRoot: projectRoot,
    analyzers: select(configureAnalyzers(presetSet, config, detectedPolicy)),
  });
  return { headPolicy, analyzers: configureAnalyzers(presetSet, config, headPolicy) };
}
