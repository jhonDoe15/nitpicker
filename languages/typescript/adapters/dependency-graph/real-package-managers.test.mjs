import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { withTemporaryWorktree } from '../../../../core/diff/git/repository/worktree.mjs';
import {
  commit,
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
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
        localPackagePaths: [],
      });
      const libraryFolders = members.length === 0 ? ['node_modules'] : members;
      const hasFile = (folder, name) => existsSync(path.join(projectRoot, folder, name));
      expect(libraryFolders.map((folder) => hasFile(folder, 'fixture-lib/fixture.json'))).toEqual(
        libraryFolders.map(() => true),
      );
      expect(existsSync(path.join(projectRoot, 'ROOT_POSTINSTALL'))).toBe(false);
      expect(
        libraryFolders.map((folder) => hasFile(folder, 'fixture-lib/LIB_POSTINSTALL')),
      ).toEqual(libraryFolders.map(() => false));

      removeSnapshotDependencies(dependencies);

      expect(existsSync(path.join(projectRoot, 'node_modules'))).toBe(false);
      expect(members.map((member) => existsSync(path.join(projectRoot, member)))).toEqual(
        members.map(() => false),
      );
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

function baseWorktreeInstall(liveRoot, check) {
  return withTemporaryWorktree(liveRoot, { commitSha: 'HEAD', warn: vi.fn() }, (worktreeRoot) => {
    const dependencies = resolveDependencyHook().install(worktreeRoot, liveRoot);
    try {
      check(worktreeRoot, dependencies);
    } finally {
      removeSnapshotDependencies(dependencies);
    }
    expect(dependencies.localPackagePaths.filter((copied) => existsSync(copied))).toEqual([]);
    return dependencies;
  });
}

describe('local packages the base checkout does not hold', () => {
  for (const testCase of CASES) {
    it(`copies an untracked file: package from the working tree for ${testCase.label}`, (context) => {
      requireManager(testCase, context);
      const projectRoot = installFixture(testCase.fixture, { '.gitignore': 'vendor/\n' });
      commit(projectRoot, 'manifests without the vendored package');

      const dependencies = baseWorktreeInstall(projectRoot, (worktreeRoot) => {
        const folders = testCase.members.length === 0 ? ['node_modules'] : testCase.members;
        const installed = (folder) =>
          existsSync(path.join(worktreeRoot, folder, 'fixture-lib/fixture.json'));
        expect(folders.filter((folder) => !installed(folder))).toEqual([]);
      });

      expect(dependencies.localPackagePaths.map((copied) => path.basename(copied))).toEqual([
        'fixture-lib',
      ]);
      expect(existsSync(path.join(projectRoot, 'vendor/fixture-lib/LIB_POSTINSTALL'))).toBe(false);
    });
  }

  it('installs npm folder and tarball packages from outside the repository', (context) => {
    requireManager(CASES[0], context);
    const outside = git.temporaryRoot('nitpicker-local-packages-');
    const liveRoot = path.join(outside, 'app');
    copyProjectFixture('npm-outside', liveRoot);
    renameSync(path.join(liveRoot, 'vendor/fixture-lib'), path.join(outside, 'fixture-lib'));
    writeFiles(outside, {
      'packed/package/package.json': '{"name":"packed-lib","version":"1.0.0"}',
    });
    const packed = spawnSync('tar', ['-czf', '../packed-lib-1.0.0.tgz', 'package'], {
      cwd: path.join(outside, 'packed'),
      timeout: 10_000,
    });
    expect(packed.status).toBe(0);
    writeFiles(liveRoot, { '.gitignore': 'vendor/\n' });
    fixtureGit(liveRoot, ['init', '-q', '--initial-branch=main']);
    commit(liveRoot, 'local packages');

    baseWorktreeInstall(liveRoot, (worktreeRoot) => {
      expect(existsSync(path.join(worktreeRoot, 'node_modules/fixture-lib/fixture.json'))).toBe(
        true,
      );
      expect(existsSync(path.join(worktreeRoot, 'node_modules/packed-lib/package.json'))).toBe(
        true,
      );
    });
  });
});
