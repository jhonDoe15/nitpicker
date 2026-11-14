import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { projectTestRunner } from './project-runner.mts';
import { useTemporaryProjects } from '../test-support/temporary-projects.mts';

const { projectWith } = useTemporaryProjects('nitpicker-project-runner-');

function project(scripts: Record<string, string>): string {
  return projectWith({ 'package.json': JSON.stringify({ scripts }) });
}

describe('the test runner nitpicker runs for a snapshot', () => {
  it('takes the runner and the test command from the live project for both snapshots', () => {
    const base = project({ test: 'jest --ci' });
    const live = project({ test: 'tsc && vitest run --project unit' });

    expect(projectTestRunner({ projectRoot: base, liveProjectRoot: live })).toEqual({
      runner: 'vitest',
      evidence: 'package.json script "test"',
      command: {
        environment: {},
        nodeArguments: [],
        arguments_: ['run', '--project', 'unit'],
        precedingCommands: ['tsc'],
      },
    });
  });

  it('reads the snapshot itself when no live project is named', () => {
    const root = project({ test: 'echo none' });
    const expected = {
      runner: 'vitest',
      evidence: 'the default',
      command: { environment: {}, nodeArguments: [], arguments_: [], precedingCommands: [] },
    };

    expect(projectTestRunner({ projectRoot: root })).toEqual(expected);
    expect(projectTestRunner({ projectRoot: root, liveProjectRoot: PACKAGE_ROOT })).toEqual(
      expected,
    );
  });
});
