import { detectTestRunner } from '../../../languages/typescript/preset/test-runner/detect-runner.mjs';
import { RUNNER_NAMES } from '../../../languages/typescript/preset/test-runner/runners.mjs';
import { hasScopePackage } from '../../../languages/typescript/preset/eslint-config/scope-support.mjs';
import { describePackageManager } from './package-manager.mts';
import type { InitProject } from '../init-types.mts';
import { textOf } from '../../../shared/values/readers.mts';

const runnerIn: (projectRoot: string) => { readonly runner: unknown } = detectTestRunner;
const runnerNames: Readonly<Record<string, string>> = RUNNER_NAMES;
const hasScope: (projectRoot: string, name: string) => boolean = hasScopePackage;

const LABELS: Readonly<Record<string, string>> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
};

export function describeNodeProject(projectRoot: string, preset: string): InitProject {
  const testRunner = textOf(runnerIn(projectRoot).runner);
  const react = preset === 'typescript' && hasScope(projectRoot, 'react');
  const packageManager = describePackageManager(projectRoot);
  return {
    preset,
    family: 'node',
    packageManager,
    testRunner,
    notes: [],
    summary: [
      `${textOf(LABELS[preset])}${react ? ' with React' : ''}`,
      packageManager.name,
      runnerNames[testRunner],
    ].join(', '),
  };
}
