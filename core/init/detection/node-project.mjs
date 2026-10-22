import { detectTestRunner } from '../../../languages/typescript/preset/test-runner/detect-runner.mjs';
import { RUNNER_NAMES } from '../../../languages/typescript/preset/test-runner/runners.mjs';
import { hasScopePackage } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import { detectPackageManager } from './package-manager.mjs';

const LABELS = { typescript: 'TypeScript', javascript: 'JavaScript' };
const JAVASCRIPT_RUNNER = 'vitest';

function javascriptRunnerNotes(runner) {
  return runner === JAVASCRIPT_RUNNER
    ? []
    : [
        `The JavaScript preset runs Vitest only, so a ${RUNNER_NAMES[runner]} project cannot pass yet. See "JavaScript preset" in docs/usage.md.`,
      ];
}

export function describeNodeProject(projectRoot, preset) {
  const javascript = preset === 'javascript';
  const detectedRunner = detectTestRunner(projectRoot).runner;
  const react = !javascript && hasScopePackage(projectRoot, 'react');
  const packageManager = detectPackageManager(projectRoot);
  const testRunner = javascript ? JAVASCRIPT_RUNNER : detectedRunner;
  return {
    preset,
    family: 'node',
    packageManager,
    testRunner,
    notes: javascript ? javascriptRunnerNotes(detectedRunner) : [],
    summary: [
      `${LABELS[preset]}${react ? ' with React' : ''}`,
      packageManager.name,
      RUNNER_NAMES[testRunner],
    ].join(', '),
  };
}
