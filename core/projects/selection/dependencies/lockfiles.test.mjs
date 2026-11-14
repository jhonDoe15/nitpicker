import { describe, expect, it } from 'vitest';
import { changedPackages, closureOf, isLockfile, parseLockfile } from './lockfiles.mjs';

function lockOf(file, text) {
  return parseLockfile(file, text).lock;
}

function versionsOf(lock) {
  return Object.fromEntries([...lock.versions].map(([name, versions]) => [name, [...versions]]));
}

const NPM = (lodash) =>
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root' },
      'apps/web': { name: 'web', dependencies: { lodash: '^4' } },
      'node_modules/lodash': { version: lodash },
      'node_modules/react': { version: '19.0.0', dependencies: { scheduler: '^0.25' } },
      'node_modules/scheduler': { version: '0.25.0' },
      'apps/web/node_modules/@acme/ui': { version: '1.0.0' },
    },
  });

const PNPM = (lodash) => `lockfileVersion: '9.0'
importers:
  apps/web:
    dependencies:
      lodash:
        specifier: ^4
        version: ${lodash}
packages:
  lodash@${lodash}:
    resolution: {integrity: sha512-x}
  react@19.0.0:
    resolution: {integrity: sha512-y}
snapshots:
  lodash@${lodash}: {}
  react-dom@19.0.0(react@19.0.0):
    dependencies:
      react: 19.0.0
`;

const YARN_V1 = `# yarn lockfile v1

"lodash@^4.17.20", lodash@^4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"

react@^19:
  version "19.0.0"
  dependencies:
    scheduler "^0.25.0"
`;

const YARN_BERRY = `__metadata:
  version: 8

"react@npm:^19":
  version: 19.0.0
  dependencies:
    scheduler: "npm:^0.25.0"
  languageName: node

"web@workspace:apps/web":
  version: 0.0.0-use.local
  dependencies:
    react: "npm:^19"
`;

const UV = `version = 1

[[package]]
name = "api"
version = "0.1.0"
source = { editable = "api" }
dependencies = [{ name = "httpx" }]

[[package]]
name = "httpx"
version = "0.27.0"
dependencies = [{ name = "anyio" }]

[[package]]
name = "anyio"
version = "4.4.0"
`;

describe('lockfiles', () => {
  it('knows the lockfiles it reads', () => {
    expect(
      ['package-lock.json', 'a/pnpm-lock.yaml', 'yarn.lock', 'uv.lock', 'poetry.lock'].map(
        isLockfile,
      ),
    ).toEqual([true, true, true, true, false]);
  });

  it('reads the resolved versions and dependencies of each format', () => {
    expect(versionsOf(lockOf('package-lock.json', NPM('4.17.21')))).toEqual({
      lodash: ['4.17.21'],
      react: ['19.0.0'],
      scheduler: ['0.25.0'],
      '@acme/ui': ['1.0.0'],
    });
    expect(versionsOf(lockOf('pnpm-lock.yaml', PNPM('4.17.21')))).toEqual({
      lodash: ['4.17.21'],
      react: ['19.0.0'],
      'react-dom': ['19.0.0'],
    });
    expect(versionsOf(lockOf('yarn.lock', YARN_V1)).lodash).toEqual(['4.17.21']);
    expect([...closureOf(lockOf('yarn.lock', YARN_V1), ['react'])]).toEqual(['react', 'scheduler']);
    expect([...closureOf(lockOf('yarn.lock', YARN_BERRY), ['react'])]).toEqual([
      'react',
      'scheduler',
    ]);
    expect([...closureOf(lockOf('uv.lock', UV), ['api'])]).toEqual(['api', 'httpx', 'anyio']);
  });

  it('names the packages whose resolved versions changed', () => {
    const [base, head] = ['4.17.20', '4.17.21'].map((version) =>
      lockOf('pnpm-lock.yaml', PNPM(version)),
    );

    expect([...changedPackages(base, head)]).toEqual([['lodash', 'lodash 4.17.20 -> 4.17.21']]);
  });

  it('gives no lock for a file it cannot read', () => {
    expect(parseLockfile('package-lock.json', '{').lock).toBeUndefined();
    expect(parseLockfile('package-lock.json', '{"dependencies":{}}').lock).toBeUndefined();
  });
});
