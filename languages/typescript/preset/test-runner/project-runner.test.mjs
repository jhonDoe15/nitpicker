import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { projectTestRunner } from './project-runner.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(scripts) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-runner-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }));
  return root;
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
