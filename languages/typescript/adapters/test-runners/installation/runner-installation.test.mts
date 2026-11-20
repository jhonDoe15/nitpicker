import { realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mts';
import { runnerInstallation } from './runner-installation.mts';
import { tempProjects } from '../../../preset/eslint-config/test-support/temp-projects.mts';
import { linkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';

const projectWith = tempProjects('nitpicker-runner-tools-');

function emptyProject(): string {
  return realpathSync(projectWith({}));
}

describe('whether a test runner is installed for the project', () => {
  it.each(['vitest', 'jest', 'mocha', 'node'])('finds %s where it is installed', (runner) => {
    expect(runnerInstallation(runner, PACKAGE_ROOT)).toEqual({ installed: true });
  });

  it.each([
    [
      'vitest',
      '^3.2.0 || ^4.1.11 || ^5.0.0 as a dev dependency of the project. If npm 10 failed to install it with "reading \'edgesOut\'", install with npm 11 (`npx npm@11 install`) or use Vitest 5.',
    ],
    ['jest', '>=29 as a dev dependency of the project.'],
    ['mocha', '>=10 as a dev dependency of the project.'],
  ])('misses %s in a project without it', (runner, install) => {
    const root = emptyProject();

    expect(runnerInstallation(runner, root)).toEqual({
      installed: false,
      reason: `Required tool ${runner} is not installed from ${root}. Install ${runner} ${install} ${String(linkSentence('missingPeer'))}`,
    });
  });

  it('always has node:test, which ships with Node', () => {
    expect(runnerInstallation('node', emptyProject())).toEqual({ installed: true });
  });
});
