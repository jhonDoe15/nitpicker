import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { removeSnapshotDependencies } from '../static-checks/dependencies.mjs';
import { resolveDependencyHook } from './dependency-hooks.mjs';
import {
  copyProjectFixture,
  managerVersion,
} from './package-managers/test-support/project-fixtures.mjs';

const { temporaryRoot } = useGitFixtures();

const CASES = [
  { label: 'npm', fixture: 'npm', binary: 'npm', version: /^\d/u, members: [] },
  { label: 'pnpm', fixture: 'pnpm', binary: 'pnpm', version: /^\d/u, members: [] },
  { label: 'yarn classic', fixture: 'yarn', binary: 'yarn', version: /^1\./u, members: [] },
  { label: 'yarn berry', fixture: 'berry', binary: 'yarn', version: /^4\./u, members: [] },
  { label: 'bun', fixture: 'bun', binary: 'bun', version: /^\d/u, members: [] },
  {
    label: 'pnpm workspace',
    fixture: 'pnpm-workspace',
    binary: 'pnpm',
    version: /^\d/u,
    members: ['packages/app/node_modules'],
  },
];

describe('frozen install with the real package managers', () => {
  for (const { label, fixture, binary, version, members } of CASES) {
    it.skipIf(!version.test(managerVersion(binary, fixture)))(
      `installs the ${label} fixture without running scripts and removes it again`,
      () => {
        const projectRoot = copyProjectFixture(fixture, temporaryRoot('real-manager-'));

        const dependencies = resolveDependencyHook().install(projectRoot);

        expect(dependencies).toEqual({
          kind: 'installed',
          dependencyPath: path.join(projectRoot, 'node_modules'),
          memberPaths: members.map((member) => path.join(projectRoot, member)),
        });
        const libraries = (members.length === 0 ? ['node_modules'] : members).map((directory) =>
          existsSync(path.join(projectRoot, directory, 'fixture-lib/fixture.json')),
        );
        expect(libraries).toEqual(libraries.map(() => true));
        expect(existsSync(path.join(projectRoot, 'ROOT_POSTINSTALL'))).toBe(false);

        removeSnapshotDependencies(dependencies);

        expect(existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);
      },
    );
  }
});
