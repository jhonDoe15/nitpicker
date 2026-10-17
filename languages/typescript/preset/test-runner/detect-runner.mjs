import { readManifest } from '../eslint-config/scope-support.mjs';
import { defaultResolvedLayout } from '../layout.mjs';
import { ambiguityMessage, chooseRunner } from './detection/choose-runner.mjs';
import { configEvidence, dependencyEvidence } from './detection/project-files.mjs';
import { importEvidence } from './detection/test-imports.mjs';
import {
  TEST_SCRIPT,
  manifestScripts,
  otherTestScriptNames,
  scriptCommand,
  scriptEvidence,
} from './detection/test-scripts.mjs';

export function runnerDetection(projectRoot, layout = defaultResolvedLayout) {
  const manifest = readManifest(projectRoot) ?? {};
  const scripts = manifestScripts(manifest);
  return chooseRunner([
    () => scriptEvidence(scripts, [TEST_SCRIPT]),
    () => [
      ...scriptEvidence(scripts, otherTestScriptNames(scripts)),
      ...configEvidence(projectRoot, manifest),
    ],
    () => importEvidence(projectRoot, layout),
    () => dependencyEvidence(manifest),
  ]);
}

export function detectTestRunner(projectRoot, layout) {
  const detection = runnerDetection(projectRoot, layout);
  if (detection.candidates !== undefined) {
    throw new Error(ambiguityMessage(detection.candidates));
  }
  return detection;
}

export function testRunnerFor(projectRoot, configured, layout) {
  return configured === undefined
    ? detectTestRunner(projectRoot, layout)
    : {
        runner: configured,
        evidence: 'nitpicker.config.json "tools.tests.runner"',
        command: scriptCommand(manifestScripts(readManifest(projectRoot)), configured),
      };
}

export function detectedRunnerFact(projectRoot, { configured, layout }) {
  const runner =
    configured === undefined
      ? detectTestRunner(projectRoot, layout).runner
      : runnerDetection(projectRoot, layout).runner;
  return runner === undefined ? {} : { detectedRunner: runner };
}
