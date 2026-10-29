import { describe, expect, it } from 'vitest';
import { packageVersion } from '../../help/package-version.mjs';
import { useProjects } from '../test-support/projects.mjs';
import { missingNodePeers, requiredNodePeers } from './node-peers.mjs';

const project = useProjects();
const NITPICKER = `nitpicker@${packageVersion()}`;
const ALL_VITEST_PEERS = [
  NITPICKER,
  'typescript@^6',
  '@types/node',
  'vitest',
  '@vitest/coverage-v8',
];

function installed(name, version = '1.0.0') {
  return { [`node_modules/${name}/package.json`]: JSON.stringify({ name, version }) };
}

describe('required Node peers', () => {
  it.each([
    ['vitest', ['vitest', '@vitest/coverage-v8']],
    ['jest', ['jest']],
    ['mocha', ['mocha']],
    ['node', []],
  ])('adds the %s runner packages to the common ones', (runner, extra) => {
    expect(requiredNodePeers(runner)).toEqual(['nitpicker', 'typescript', '@types/node', ...extra]);
  });
});

describe('missing Node peers', () => {
  it('lists everything for a bare package', () => {
    expect(missingNodePeers(project({ 'package.json': '{}' }), 'vitest')).toEqual(ALL_VITEST_PEERS);
  });

  it('lists everything when there is no package.json', () => {
    expect(missingNodePeers(project({}), 'vitest')).toEqual(ALL_VITEST_PEERS);
  });

  it.each(['dependencies', 'devDependencies', 'optionalDependencies'])(
    'skips what %s declares',
    (field) => {
      const root = project({ 'package.json': JSON.stringify({ [field]: { typescript: '^6' } }) });

      expect(missingNodePeers(root, 'vitest')).toEqual(
        ALL_VITEST_PEERS.filter((name) => name !== 'typescript@^6'),
      );
    },
  );

  it('does not count a peer dependency as installed', () => {
    const root = project({ 'package.json': '{"peerDependencies":{"typescript":"^6"}}' });

    expect(missingNodePeers(root, 'node')).toEqual([NITPICKER, 'typescript@^6', '@types/node']);
  });

  it('skips what node_modules already holds, also in a parent folder', () => {
    const root = project({ ...installed('typescript', '6.0.3'), 'web/package.json': '{}' });

    expect(missingNodePeers(`${root}/web`, 'node')).toEqual([NITPICKER, '@types/node']);
  });

  it('asks only for the packages of the runner the project uses', () => {
    const root = project({
      'package.json': JSON.stringify({
        devDependencies: { nitpicker: '1', typescript: '6', '@types/node': '25' },
      }),
    });

    expect(missingNodePeers(root, 'jest')).toEqual(['jest']);
    expect(missingNodePeers(root, 'mocha')).toEqual(['mocha']);
    expect(missingNodePeers(root, 'node')).toEqual([]);
    expect(missingNodePeers(root, 'vitest')).toEqual(['vitest', '@vitest/coverage-v8']);
  });

  it('pins the coverage package to the Vitest version that is installed', () => {
    const root = project({
      'package.json': JSON.stringify({ devDependencies: { nitpicker: '1', typescript: '6' } }),
      ...installed('vitest', '4.1.11'),
      ...installed('@types/node'),
    });

    expect(missingNodePeers(root, 'vitest')).toEqual(['@vitest/coverage-v8@4.1.11']);
  });

  it('leaves a coverage package that is present alone', () => {
    const root = project({
      'package.json': JSON.stringify({
        devDependencies: {
          nitpicker: '1',
          typescript: '6',
          '@types/node': '25',
          vitest: '4',
          '@vitest/coverage-v8': '4',
        },
      }),
    });

    expect(missingNodePeers(root, 'vitest')).toEqual([]);
  });

  it.each([
    ['an installed TypeScript 7', { ...installed('typescript', '7.0.2') }],
    ['an installed TypeScript 5.6', { ...installed('typescript', '5.6.3') }],
    ['a declared TypeScript 7', { 'package.json': '{"devDependencies":{"typescript":"^7.0.0"}}' }],
    [
      'a declared latest TypeScript',
      { 'package.json': '{"devDependencies":{"typescript":"latest"}}' },
    ],
  ])('asks for TypeScript 6 over %s, which nitpicker cannot read', (_name, files) => {
    expect(missingNodePeers(project(files), 'node')).toEqual([
      NITPICKER,
      'typescript@^6',
      '@types/node',
    ]);
  });

  it.each([
    ['an installed TypeScript 5.7', installed('typescript', '5.7.3')],
    [
      'a declared TypeScript 5.8',
      { 'package.json': '{"devDependencies":{"typescript":"~5.8.2"}}' },
    ],
    ['a declared TypeScript 6', { 'package.json': '{"devDependencies":{"typescript":"6.0.3"}}' }],
  ])('takes %s as present', (_name, files) => {
    expect(missingNodePeers(project(files), 'node')).toEqual([NITPICKER, '@types/node']);
  });

  it('judges the installed TypeScript over the declared range', () => {
    const root = project({
      'package.json': '{"devDependencies":{"typescript":"^6"}}',
      ...installed('typescript', '7.0.2'),
    });

    expect(missingNodePeers(root, 'node')).toEqual([NITPICKER, 'typescript@^6', '@types/node']);
  });
});
