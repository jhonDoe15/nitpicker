import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../../diff/git/test-support/fixture-files.mts';
import { projectFiles, useMonorepoFixtures } from '../../test-support/monorepo-harness.mjs';

const { repository, run } = useMonorepoFixtures();

const manifest = (name, dependencies = {}) =>
  JSON.stringify({ name, version: '1.0.0', dependencies });

const NPM = (lodash) =>
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', workspaces: ['apps/*'] },
      'node_modules/lodash': { version: lodash },
      'node_modules/react': { version: '19.0.0', dependencies: { scheduler: '^0.25' } },
      'node_modules/scheduler': { version: '0.25.0' },
    },
  });
const PNPM = (lodash) =>
  `lockfileVersion: '9.0'\npackages:\n  lodash@${lodash}: {}\n  react@19.0.0: {}\n` +
  `snapshots:\n  lodash@${lodash}: {}\n  react@19.0.0: {}\n`;
const YARN = (lodash) =>
  `# yarn lockfile v1\n\nlodash@^4:\n  version "${lodash}"\n\nreact@^19:\n  version "19.0.0"\n`;

function workspace(lockfile, text) {
  return repository({
    'package.json': JSON.stringify({ name: 'root', workspaces: ['apps/*'] }),
    [lockfile]: text,
    ...projectFiles('apps/lists', {
      'package.json': manifest('lists', { lodash: '^4' }),
      'src/index.ts': 'export {};\n',
    }),
    ...projectFiles('apps/views', {
      'package.json': manifest('views', { react: '^19' }),
      'src/index.ts': 'export {};\n',
    }),
  });
}

describe('a lockfile change', () => {
  it.each([
    ['package-lock.json', NPM],
    ['pnpm-lock.yaml', PNPM],
    ['yarn.lock', YARN],
  ])('in %s runs only the members whose resolved dependencies changed', (lockfile, text) => {
    const root = workspace(lockfile, text('4.17.20'));
    writeFiles(root, { [lockfile]: text('4.17.21') });

    const result = run(root, ['--details']);

    expect(result.plan.split('\n').slice(1)).toEqual([
      `  run  apps/lists (typescript): ${lockfile}: lodash 4.17.20 -> 4.17.21`,
      '  skip apps/views (typescript): no changed files',
    ]);
    expect(result.out).not.toContain('outside every project');
  });

  it('runs every member when the lockfile cannot be read', () => {
    const root = workspace('package-lock.json', NPM('4.17.20'));
    writeFiles(root, { 'package-lock.json': '{ not json' });

    const result = run(root, ['--details']);

    expect(result.plan.split('\n').slice(1)).toEqual([
      '  run  apps/lists (typescript): package-lock.json changed',
      '  run  apps/views (typescript): package-lock.json changed',
    ]);
  });
});

describe('a version catalog change', () => {
  it('runs only the JVM projects whose build uses a changed alias', () => {
    const catalog = (guava) =>
      `[versions]\nguava = "${guava}"\n\n[libraries]\n` +
      'guava = { module = "com.google.guava:guava", version.ref = "guava" }\n' +
      'jackson-core = { module = "com.fasterxml.jackson.core:jackson-core", version = "2.17.0" }\n';
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['services/*'] }),
      'gradle/libs.versions.toml': catalog('33.0.0-jre'),
      ...projectFiles('services/orders', {
        'build.gradle': 'dependencies { implementation libs.guava }\n',
      }),
      ...projectFiles('services/users', {
        'build.gradle': 'dependencies { implementation libs.jackson.core }\n',
      }),
    });
    writeFiles(root, { 'gradle/libs.versions.toml': catalog('33.2.0-jre') });

    expect(run(root, ['--details']).plan.split('\n').slice(1)).toEqual([
      '  run  services/orders (java): libs.versions.toml: libs.guava',
      '  skip services/users (java): no changed files',
    ]);
  });

  it('runs the projects that reach a changed library through a bundle or read its version', () => {
    const catalog = (guava) =>
      `[versions]\nguava = "${guava}"\n\n[libraries]\n` +
      'guava = { module = "com.google.guava:guava", version.ref = "guava" }\n\n' +
      '[bundles]\ncore = ["guava"]\n';
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['services/*'] }),
      'gradle/libs.versions.toml': catalog('33.0.0-jre'),
      ...projectFiles('services/billing', {
        'build.gradle': 'dependencies { implementation libs.bundles.core }\n',
      }),
      ...projectFiles('services/tools', {
        'build.gradle': 'println(libs.versions.guava.get())\n',
      }),
    });
    writeFiles(root, { 'gradle/libs.versions.toml': catalog('33.2.0-jre') });

    expect(run(root, ['--details']).plan.split('\n').slice(1)).toEqual([
      '  run  services/billing (java): libs.versions.toml: libs.bundles.core',
      '  run  services/tools (java): libs.versions.toml: libs.versions.guava',
    ]);
  });
});
