import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { removeSnapshotDependencies } from '../static-checks/dependencies.mjs';
import { resolveDependencyHook } from './dependency-hooks.mjs';
import {
  copyProjectFixture,
  managerVersion,
} from './package-managers/test-support/project-fixtures.mjs';

const git = useGitFixtures();
const REQUIRED = Boolean(process.env.CI);

const ANY_VERSION = /^\d/u;
const PNPM = /^10\.28\.0$/u;
const YARN_CLASSIC = /^1\.22\.22$/u;
const YARN_BERRY = /^4\.9\.2$/u;
const BUN = /^1\.4\.2$/u;

const CASES = [
  { label: 'npm', fixture: 'npm', binary: 'npm', version: ANY_VERSION, members: [] },
  { label: 'pnpm', fixture: 'pnpm', binary: 'pnpm', version: PNPM, members: [] },
  { label: 'yarn classic', fixture: 'yarn', binary: 'yarn', version: YARN_CLASSIC, members: [] },
  { label: 'yarn berry', fixture: 'berry', binary: 'yarn', version: YARN_BERRY, members: [] },
  { label: 'bun', fixture: 'bun', binary: 'bun', version: BUN, members: [] },
  {
    label: 'pnpm workspace',
    fixture: 'pnpm-workspace',
    binary: 'pnpm',
    version: PNPM,
    members: ['packages/app/node_modules'],
  },
];

function requireManager({ label, fixture, binary, version }, context) {
  const found = managerVersion(binary, fixture);
  if (version.test(found)) {
    return;
  }
  if (REQUIRED) {
    throw new Error(
      `${label} ${String(version)} is required in CI, but \`${binary} --version\` printed "${found}"`,
    );
  }
  context.skip(`${label} is not installed`);
}

function installFixture(fixture, extraFiles = {}) {
  const projectRoot = copyProjectFixture(fixture, git.createGitRepository().root);
  writeFiles(projectRoot, extraFiles);
  return projectRoot;
}

describe('frozen install with the real package managers', () => {
  for (const testCase of CASES) {
    it(`installs the ${testCase.label} fixture without running scripts and removes it again`, (context) => {
      requireManager(testCase, context);
      const { fixture, members } = testCase;
      const projectRoot = installFixture(fixture);

      const dependencies = resolveDependencyHook().install(projectRoot);

      expect(dependencies).toEqual({
        kind: 'installed',
        dependencyPath: path.join(projectRoot, 'node_modules'),
        memberPaths: members.map((member) => path.join(projectRoot, member)),
      });
      const libraryFolders = members.length === 0 ? ['node_modules'] : members;
      for (const folder of libraryFolders) {
        expect(existsSync(path.join(projectRoot, folder, 'fixture-lib/fixture.json'))).toBe(true);
      }
      expect(existsSync(path.join(projectRoot, 'ROOT_POSTINSTALL'))).toBe(false);
      for (const folder of libraryFolders) {
        expect(existsSync(path.join(projectRoot, folder, 'fixture-lib/LIB_POSTINSTALL'))).toBe(
          false,
        );
      }

      removeSnapshotDependencies(dependencies);

      expect(existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);
      for (const member of members) {
        expect(existsSync(path.join(projectRoot, member))).toBe(false);
      }
    });
  }
});

describe('Yarn Plug and Play', () => {
  it('is reported when the install leaves no node_modules folder', (context) => {
    requireManager(CASES[3], context);
    const projectRoot = installFixture('berry', { '.yarnrc.yml': 'nodeLinker: pnp\n' });

    expect(() => resolveDependencyHook().install(projectRoot)).toThrow(
      new Error(
        "Failed to install merge-base dependencies with yarn: the install created no node_modules folder (Yarn Plug'n'Play is not supported: set `nodeLinker: node-modules`)",
      ),
    );
    expect(existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);
  });
});

const WRITE_MARKER = "require('fs').writeFileSync(__dirname + '/PWNED', 'ran');\n";

describe('repository code that a frozen install must not run', () => {
  it('ignores the pnpmfile of the base', (context) => {
    requireManager(CASES[1], context);
    const projectRoot = installFixture('pnpm', {
      '.pnpmfile.cjs': `${WRITE_MARKER}module.exports = {};\n`,
    });

    const dependencies = resolveDependencyHook().install(projectRoot);

    expect(existsSync(path.join(projectRoot, 'PWNED'))).toBe(false);
    removeSnapshotDependencies(dependencies);
  });

  it('ignores the yarn-path of a Yarn 1 base', (context) => {
    requireManager(CASES[2], context);
    const projectRoot = installFixture('yarn', {
      '.yarnrc': 'yarn-path "./evil.js"\n',
      'evil.js': WRITE_MARKER,
    });

    const dependencies = resolveDependencyHook().install(projectRoot);

    expect(existsSync(path.join(projectRoot, 'PWNED'))).toBe(false);
    removeSnapshotDependencies(dependencies);
  });

  it('ignores the yarnPath of a Yarn 2 and later base', (context) => {
    requireManager(CASES[3], context);
    const projectRoot = installFixture('berry', {
      '.yarnrc.yml': 'nodeLinker: node-modules\nyarnPath: ./evil.cjs\n',
      'evil.cjs': WRITE_MARKER,
    });

    const dependencies = resolveDependencyHook().install(projectRoot);

    expect(existsSync(path.join(projectRoot, 'PWNED'))).toBe(false);
    removeSnapshotDependencies(dependencies);
  });
});
