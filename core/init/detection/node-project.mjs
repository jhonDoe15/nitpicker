import { detectTestRunner } from '../../../languages/typescript/preset/test-runner/detect-runner.mjs';
import { RUNNER_NAMES } from '../../../languages/typescript/preset/test-runner/runners.mjs';
import { hasScopePackage } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import { describePackageManager } from './package-manager.mjs';

const LABELS = { typescript: 'TypeScript', javascript: 'JavaScript' };

export function describeNodeProject(projectRoot, preset) {
  const testRunner = detectTestRunner(projectRoot).runner;
  const react = preset === 'typescript' && hasScopePackage(projectRoot, 'react');
  const packageManager = describePackageManager(projectRoot);
  return {
    preset,
    family: 'node',
    packageManager,
    testRunner,
    notes: [],
    summary: [
      `${LABELS[preset]}${react ? ' with React' : ''}`,
      packageManager.name,
      RUNNER_NAMES[testRunner],
    ].join(', '),
  };
}
