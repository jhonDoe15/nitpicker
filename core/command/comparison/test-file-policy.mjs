import { configureAnalyzers } from '../../configuration/configure-analyzers.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mjs';
import { resolveProjectHeadPolicy } from '../../conventions/project-head-policy.mjs';
import { applyRunProfile } from '../../quick/profile.mjs';
import { stagedCapture } from '../../staged/capture-index.mjs';
import { requestedAnalyzers } from './analyzers.mjs';
import { withProjectTestFiles } from '../../../languages/typescript/preset/test-runner/test-files/project-test-files.mjs';

function configuredWithTestFiles({ presetSet, config, detectedPolicy, projectRoot, select }) {
  const headPolicy = withProjectTestFiles(detectedPolicy, {
    projectRoot,
    liveProjectRoot: projectRoot,
    analyzers: select(configureAnalyzers(presetSet, config, detectedPolicy)),
  });
  return { headPolicy, analyzers: configureAnalyzers(presetSet, config, headPolicy) };
}

export function configuredRunSetup(cli, { config, currentProjectRoot }) {
  const { options } = cli;
  const presetSet = presetAnalyzers(config, options.all ? cli.snapshotAnalyzers : cli.analyzers);
  const { headPolicy, analyzers } = configuredWithTestFiles({
    presetSet,
    config,
    projectRoot: currentProjectRoot,
    detectedPolicy: resolveProjectHeadPolicy(config, currentProjectRoot, {
      maven: cli.environment.NITPICKER_MAVEN,
    }),
    select: (configured) => requestedAnalyzers(options, configured),
  });
  const setup = {
    ...applyRunProfile(analyzers, options),
    captureHead: stagedCapture(cli, currentProjectRoot),
  };
  return { presetSet, headPolicy, setup };
}
