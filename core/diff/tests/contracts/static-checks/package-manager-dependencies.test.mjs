import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dependencyPreparationMode,
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../../../../languages/typescript/adapters/static-checks/dependencies.mjs';
import { installFakeManagers } from '../../../../../languages/typescript/adapters/dependency-graph/package-managers/test-support/fake-managers.mjs';
import { toolRoot, useStaticCheckFixtures } from './test-support/static-check-fixtures.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';

const { temporaryDirectory } = useStaticCheckFixtures();

afterEach(() => {
  vi.unstubAllEnvs();
});

const MANIFEST = '{"name":"fixture"}\n';

function snapshotAndLive(files) {
  const projectRoot = temporaryDirectory('base-snapshot-');
  const liveProjectRoot = temporaryDirectory('live-project-');
  writeFiles(projectRoot, { 'package.json': MANIFEST, ...files.snapshot });
  writeFiles(liveProjectRoot, { 'package.json': MANIFEST, ...files.live });
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
    'bun.lockb',
  ])('installs the base when only %s differs', (lockfile) => {
    const { projectRoot, liveProjectRoot } = snapshotAndLive({
      snapshot: { [lockfile]: 'base\n' },
      live: { [lockfile]: 'head\n' },
    });

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

  it('links the dependency folders of workspace members that exist in the base', () => {
    const { projectRoot, liveProjectRoot } = snapshotAndLive({
      snapshot: {
        'pnpm-lock.yaml': 'lock\n',
        'packages/web/package.json': '{"name":"web"}\n',
      },
      live: {
        'pnpm-lock.yaml': 'lock\n',
        'packages/web/package.json': '{"name":"web"}\n',
        'packages/api/package.json': '{"name":"api"}\n',
      },
    });
    for (const directory of [
      'node_modules',
      'packages/web/node_modules',
      'packages/api/node_modules',
    ]) {
      mkdirSync(path.join(liveProjectRoot, directory));
    }

    const dependencies = prepareSnapshotDependencies({ projectRoot, liveProjectRoot, toolRoot });

    expect(dependencies).toEqual({
      kind: 'linked',
      dependencyPath: path.join(projectRoot, 'node_modules'),
      dependencyRoot: realpathSync(path.join(liveProjectRoot, 'node_modules')),
      memberPaths: [path.join(projectRoot, 'packages/web/node_modules')],
    });
    expect(realpathSync(path.join(projectRoot, 'packages/web/node_modules'))).toBe(
      realpathSync(path.join(liveProjectRoot, 'packages/web/node_modules')),
    );

    removeSnapshotDependencies(dependencies);

    expect([
      existsSync(path.join(projectRoot, 'node_modules')),
      existsSync(path.join(projectRoot, 'packages/web/node_modules')),
      existsSync(path.join(liveProjectRoot, 'packages/web/node_modules')),
    ]).toEqual([false, false, true]);
  });

  it('names the install command when the live project has no dependency folder', () => {
    const { projectRoot, liveProjectRoot } = snapshotAndLive({
      snapshot: { 'pnpm-lock.yaml': 'lock\n' },
      live: { 'pnpm-lock.yaml': 'lock\n' },
    });

    expect(() => prepareSnapshotDependencies({ projectRoot, liveProjectRoot, toolRoot })).toThrow(
      new Error(
        `Dependencies are not installed: ${path.join(liveProjectRoot, 'node_modules')} is missing. Run \`pnpm install\` in ${liveProjectRoot} first (Yarn Plug'n'Play is not supported: set \`nodeLinker: node-modules\`).`,
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
