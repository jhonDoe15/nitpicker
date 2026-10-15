import { configError } from '../../../../shared/config.mjs';
import { collectRunnerEvidence, scriptEvidence } from './evidence.mjs';
import {
  DEFAULT_TEST_RUNNER,
  RUNNER_CHOICE_HINT,
  TEST_RUNNERS,
  testRunnerLabel,
} from './runners.mjs';

function describeCandidates(detected, evidence) {
  return detected
    .map((runner) => `${testRunnerLabel(runner)}: ${evidence.get(runner).join(', ')}`)
    .join('; ');
}

function pickByTestScript(detected, manifest) {
  const scripted = detected.filter((runner) => scriptEvidence(runner, manifest).length > 0);
  return scripted.length === 1 ? scripted[0] : undefined;
}

export function resolveTestRunner({ projectRoot, layout, configured }) {
  if (configured !== undefined) {
    return { runner: configured, source: 'config' };
  }
  const { evidence, manifest } = collectRunnerEvidence(projectRoot, layout);
  const detected = TEST_RUNNERS.filter((runner) => evidence.get(runner).length > 0);
  if (detected.length === 0) {
    return { runner: DEFAULT_TEST_RUNNER, source: 'default' };
  }
  const runner = detected.length === 1 ? detected[0] : pickByTestScript(detected, manifest);
  if (runner === undefined) {
    throw configError(
      `found several test runners (${describeCandidates(detected, evidence)}). ${RUNNER_CHOICE_HINT}`,
    );
  }
  return { runner, source: 'detected' };
}
