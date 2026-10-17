import {
  existsSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dependencyPreparationMode,
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../../../../languages/typescript/adapters/static-checks/dependencies.mjs';
import { installFakeManagers } from '../../../../../languages/typescript/adapters/dependency-graph/package-managers/test-support/fake-managers.mjs';
import { toolRoot, useStaticCheckFixtures } from './test-support/static-check-fixtures.mjs';

const { temporaryDirectory, createRepository } = useStaticCheckFixtures();

afterEach(() => {
  vi.unstubAllEnvs();
});

const MANIFEST = '{"name":"fixture"}\n';

function snapshotAndLive(files) {
  const projectRoot = createRepository({ 'package.json': MANIFEST, ...files.snapshot }).root;
  const liveProjectRoot = createRepository({ 'package.json': MANIFEST, ...files.live }).root;
  return { projectRoot, liveProjectRoot };
}

describe('dependency preparation for every package manager', () => {
  it.each([
    'package-lock.json',
    'npm-shrinkwrap.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'yarn.lock',
    'bun.lock',
    '.npmrc',
    '.yarnrc',
    '.yarnrc.yml',
    'bunfig.toml',
  ])('installs the base when only %s differs', (file) => {
    const { projectRoot, liveProjectRoot } = snapshotAndLive({
      snapshot: { [file]: 'base\n' },
      live: { [file]: 'head\n' },
    });

    expect(dependencyPreparationMode({ projectRoot, liveProjectRoot })).toBe('install');
  });

  it('installs the base when bun.lockb differs in bytes that decode to the same text', () => {
    const { projectRoot, liveProjectRoot } = snapshotAndLive({ snapshot: {}, live: {} });
    writeFileSync(path.join(projectRoot, 'bun.lockb'), Buffer.from([0xff, 0x01]));
    writeFileSync(path.join(liveProjectRoot, 'bun.lockb'), Buffer.from([0xfe, 0x01]));

    expect(dependencyPreparationMode({ projectRoot, liveProjectRoot })).toBe('install');
  });

  it.each(['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json'])(
    'installs the base when %s exists only on one side',
    (lockfile) => {
      const { projectRoot, liveProjectRoot } = snapshotAndLive({
        snapshot: {},
        live: { [lockfile]: 'head\n' },
      });

      expect(dependencyPreparationMode({ projectRoot, liveProjectRoot })).toBe('install');
    },
  );

  it('links the live dependencies when every manifest and lockfile is equal', () => {
    const files = { 'pnpm-lock.yaml': 'lock\n', 'pnpm-workspace.yaml': 'packages: []\n' };
    const { projectRoot, liveProjectRoot } = snapshotAndLive({ snapshot: files, live: files });

    expect(dependencyPreparationMode({ projectRoot, liveProjectRoot })).toBe('link');
  });

  describe('for a project inside a workspace', () => {
    const member = { 'packages/app/package.json': '{"name":"app"}\n' };

    function memberRoots(files) {
      const { projectRoot, liveProjectRoot } = snapshotAndLive(files);
      return {
        projectRoot: path.join(projectRoot, 'packages/app'),
        liveProjectRoot: path.join(liveProjectRoot, 'packages/app'),
        snapshotRepository: projectRoot,
        liveRepository: liveProjectRoot,
      };
    }

    it('installs the base when only the lockfile above the project differs', () => {
      const { projectRoot, liveProjectRoot } = memberRoots({
        snapshot: { ...member, 'pnpm-lock.yaml': 'base\n' },
        live: { ...member, 'pnpm-lock.yaml': 'head\n' },
      });

      expect(dependencyPreparationMode({ projectRoot, liveProjectRoot })).toBe('install');
    });

    it('installs the base when the lockfile moved to another folder', () => {
      const { projectRoot, liveProjectRoot } = memberRoots({
        snapshot: { ...member, 'pnpm-lock.yaml': 'lock\n' },
        live: { ...member, 'packages/app/pnpm-lock.yaml': 'lock\n' },
      });

      expect(dependencyPreparationMode({ projectRoot, liveProjectRoot })).toBe('install');
    });

    it('links the workspace root dependencies when the lockfiles are equal', () => {
      const files = { ...member, 'pnpm-lock.yaml': 'lock\n' };
      const { projectRoot, liveProjectRoot, snapshotRepository, liveRepository } = memberRoots({
        snapshot: files,
        live: files,
      });
      mkdirSync(path.join(liveRepository, 'node_modules'));

      const dependencies = prepareSnapshotDependencies({ projectRoot, liveProjectRoot, toolRoot });

      expect(dependencies).toEqual({
        kind: 'linked',
        dependencyPath: path.join(snapshotRepository, 'node_modules'),
        dependencyRoot: realpathSync(path.join(liveRepository, 'node_modules')),
        memberPaths: [],
      });
      removeSnapshotDependencies(dependencies);
      expect(existsSync(path.join(snapshotRepository, 'node_modules'))).toBe(false);
    });
  });

  describe('links of workspace members', () => {
    function linkedWorkspace() {
      const files = {
        'pnpm-lock.yaml': 'lock\n',
        'packages/app/package.json': '{"name":"app"}\n',
        'packages/lib/package.json': '{"name":"lib"}\n',
        'packages/lib/version.txt': 'base\n',
        'packages/ui/package.json': '{"name":"ui"}\n',
        'packages/ui/version.txt': 'base\n',
      };
      const { projectRoot, liveProjectRoot } = snapshotAndLive({
        snapshot: files,
        live: {
          ...files,
          'packages/lib/version.txt': 'head\n',
          'packages/api/package.json': '{"name":"api"}\n',
        },
      });
      const store = path.join(liveProjectRoot, 'node_modules/.pnpm/react@19/node_modules/react');
      mkdirSync(store, { recursive: true });
      const appModules = path.join(liveProjectRoot, 'packages/app/node_modules');
      mkdirSync(path.join(appModules, '@acme'), { recursive: true });
      symlinkSync(store, path.join(appModules, 'react'));
      symlinkSync('../../lib', path.join(appModules, 'lib'));
      symlinkSync('../../../ui', path.join(appModules, '@acme/ui'));
      symlinkSync('../../missing', path.join(appModules, 'dangling'));
      mkdirSync(path.join(liveProjectRoot, 'packages/api/node_modules'));
      return { projectRoot, liveProjectRoot, appModules };
    }

    it('point at the snapshot copy of a workspace package and at the live copy of the rest', () => {
      const { projectRoot, liveProjectRoot, appModules } = linkedWorkspace();

      const dependencies = prepareSnapshotDependencies({ projectRoot, liveProjectRoot, toolRoot });

      const snapshotModules = path.join(projectRoot, 'packages/app/node_modules');
      expect(dependencies.memberPaths).toEqual([snapshotModules]);
      expect(readlinkSync(path.join(snapshotModules, 'lib'))).toBe(
        path.join(projectRoot, 'packages/lib'),
      );
      expect(readlinkSync(path.join(snapshotModules, '@acme/ui'))).toBe(
        path.join(projectRoot, 'packages/ui'),
      );
      expect(readlinkSync(path.join(snapshotModules, 'react'))).toBe(
        realpathSync(path.join(appModules, 'react')),
      );
      expect(existsSync(path.join(snapshotModules, 'dangling'))).toBe(false);
      expect(existsSync(path.join(projectRoot, 'packages/api'))).toBe(false);

      removeSnapshotDependencies(dependencies);

      expect([
        existsSync(snapshotModules),
        existsSync(path.join(projectRoot, 'node_modules')),
        existsSync(path.join(appModules, 'react')),
      ]).toEqual([false, false, true]);
    });
  });

  it('names the install command when the live project has no dependency folder', () => {
    const files = { 'pnpm-lock.yaml': 'lock\n' };
    const { projectRoot, liveProjectRoot } = snapshotAndLive({ snapshot: files, live: files });

    expect(() => prepareSnapshotDependencies({ projectRoot, liveProjectRoot, toolRoot })).toThrow(
      new Error(
        `Dependencies are not installed: ${path.join(liveProjectRoot, 'node_modules')} is missing. Run \`pnpm install\` in ${liveProjectRoot} first.`,
      ),
    );
  });

  it('names Plug and Play when a live Yarn 2 project has no dependency folder', () => {
    const files = { 'yarn.lock': '__metadata:\n  version: 8\n' };
    const { projectRoot, liveProjectRoot } = snapshotAndLive({ snapshot: files, live: files });

    expect(() => prepareSnapshotDependencies({ projectRoot, liveProjectRoot, toolRoot })).toThrow(
      new Error(
        `Dependencies are not installed: ${path.join(liveProjectRoot, 'node_modules')} is missing. Yarn Plug'n'Play is not supported: set \`nodeLinker: node-modules\` in .yarnrc.yml and run \`yarn install\` in ${liveProjectRoot}.`,
      ),
    );
  });

  it('installs the base with the manager it uses and removes the installed folders afterwards', () => {
    vi.stubEnv(
      'PATH',
      `${installFakeManagers(temporaryDirectory('fake-managers-'))}${path.delimiter}${process.env.PATH}`,
    );
    const { projectRoot, liveProjectRoot } = snapshotAndLive({
      snapshot: {
        'yarn.lock': '# yarn lockfile v1\n',
        'packages/web/package.json': '{"name":"web"}\n',
        'fake-members.txt': 'packages/web\n',
      },
      live: { 'yarn.lock': '# yarn lockfile v1\nchanged\n' },
    });

    const dependencies = prepareSnapshotDependencies({ projectRoot, liveProjectRoot, toolRoot });

    expect(dependencies).toEqual({
      kind: 'installed',
      dependencyPath: path.join(projectRoot, 'node_modules'),
      memberPaths: [path.join(projectRoot, 'packages/web/node_modules')],
    });

    removeSnapshotDependencies(dependencies);

    expect([
      existsSync(path.join(projectRoot, 'node_modules')),
      existsSync(path.join(projectRoot, 'packages/web/node_modules')),
    ]).toEqual([false, false]);
  });
});
