import { describe, expect, it } from 'vitest';
import { scratchTrees } from '../../../../shared/test-support/scratch-trees.mts';
import { checkedModules } from './checked-modules.mts';

const reports = scratchTrees('nitpicker-checked-modules-');

const MODULES = JSON.stringify([
  { key: 'module-app', path: ':app', dir: 'app' },
  { key: 'module-lib', path: ':lib', dir: 'lib' },
]);
const stopped = new Error('Gradle did not finish');

function place(reportBase: string) {
  return { reportBase, preset: 'java', projectRoot: reportBase };
}

describe('the Gradle projects whose checks finished', () => {
  it('are every project of a build that was not stopped', () => {
    const base = reports({ 'modules.json': MODULES, 'module-app/manifest.json': '{}' });

    expect(() => checkedModules({ tasks: [], error: undefined }, place(base))).toThrow(
      'The java preset found no Gradle reports for project :lib (lib): its nitpickerJava task did not run',
    );
  });

  it('are the projects with reports when the build was stopped at its deadline', () => {
    const base = reports({ 'modules.json': MODULES, 'module-app/manifest.json': '{}' });

    const report = checkedModules(
      { tasks: [], error: stopped, stoppedAfterMinutes: 20 },
      place(base),
    );

    expect([report.modules.map((module) => module.path), report.skipped]).toEqual([
      [':app'],
      [{ path: ':lib', dir: 'lib' }],
    ]);
  });

  it('are none, with the timeout as the failure, when no project finished or was listed', () => {
    const noted = { tasks: [], error: stopped, stoppedAfterMinutes: 20 };

    expect(() => checkedModules(noted, place(reports({ 'modules.json': MODULES })))).toThrow(
      stopped,
    );
    expect(() => checkedModules(noted, place(reports({})))).toThrow(stopped);
  });
});
