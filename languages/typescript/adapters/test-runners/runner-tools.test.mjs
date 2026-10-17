import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { runnerInstallation } from './runner-tools.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function emptyProject() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-tools-')));
  roots.push(root);
  return root;
}

describe('whether a test runner is installed for the project', () => {
  it.each(['vitest', 'jest', 'mocha', 'node'])('finds %s where it is installed', (runner) => {
    expect(runnerInstallation(runner, PACKAGE_ROOT)).toEqual({ installed: true });
  });

  it.each(['vitest', 'jest', 'mocha'])('misses %s in a project without it', (runner) => {
    const root = emptyProject();

    expect(runnerInstallation(runner, root)).toEqual({
      installed: false,
      reason: `Cannot find package '${runner}' imported from ${root}/package.json`,
    });
  });

  it('always has node:test, which ships with Node', () => {
    expect(runnerInstallation('node', emptyProject())).toEqual({ installed: true });
  });
});
