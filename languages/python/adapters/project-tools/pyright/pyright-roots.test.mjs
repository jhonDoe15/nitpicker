import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeProjects } from '../../test-support/fake-project.mjs';
import { pythonConfigFiles } from '../config-files.mjs';
import { pyrightConfig } from './pyright-config.mjs';

const fakes = createFakeProjects();
afterEach(fakes.cleanup);

const LISTED = { pyright: ['project', 'nitpicker'] };
const PROJECT_CONFIG = JSON.stringify({
  include: ['src/pkg'],
  exclude: ['src/gen'],
  extraPaths: ['vendor'],
  stubPath: 'stubs',
  venv: '.venv',
  venvPath: '.',
  typeshedPath: 'shed',
  executionEnvironments: [{ root: 'src', extraPaths: ['lib'] }],
});

function snapshotConfig(files) {
  const head = fakes.project(files);
  const base = fakes.project({});
  const { context, reportRoot } = fakes.contextFor(
    base,
    {},
    { toolPrecedence: LISTED, policyRoot: head },
  );
  return { head, base, reportRoot, config: pyrightConfig(context, 'pyright') };
}

describe('pyright paths of a project config under the opt-in', () => {
  it('re-roots the source paths to the snapshot, and keeps the environment where it is', () => {
    const { head, base, reportRoot, config } = snapshotConfig({
      'pyrightconfig.json': PROJECT_CONFIG,
    });

    expect(config).toEqual({
      typeCheckingMode: 'strict',
      reportDeprecated: 'error',
      enableTypeIgnoreComments: false,
      ignore: [],
      exclude: [
        '**/node_modules',
        '**/__pycache__',
        '**/.*',
        path.relative(reportRoot, path.join(base, 'src/gen')),
      ],
      include: [path.relative(reportRoot, path.join(base, 'src/pkg'))],
      extraPaths: [path.join(base, 'vendor'), path.join(base, 'src')],
      stubPath: path.join(base, 'stubs'),
      venv: '.venv',
      venvPath: head,
      typeshedPath: path.join(head, 'shed'),
      executionEnvironments: [
        {
          root: path.join(base, 'src'),
          extraPaths: [path.join(base, 'lib'), path.join(base, 'src')],
        },
      ],
    });
  });

  it('re-roots the paths of a file the config extends', () => {
    const { base, config } = snapshotConfig({
      'pyrightconfig.json': '{ "extends": "config/base.json" }',
      'config/base.json': '{ "extraPaths": ["libs"], "stubPath": "../stubs" }',
    });

    expect(config.extraPaths).toEqual([path.join(base, 'config/libs'), path.join(base, 'src')]);
    expect(config.stubPath).toBe(path.join(base, 'stubs'));
  });

  it('keeps an extended file outside the project where it is', () => {
    const outside = fakes.project({ 'shared.json': '{ "extraPaths": ["libs"] }' });
    const { config, base } = snapshotConfig({
      'pyrightconfig.json': JSON.stringify({ extends: path.join(outside, 'shared.json') }),
    });

    expect(config.extraPaths).toEqual([path.join(outside, 'libs'), path.join(base, 'src')]);
  });
});

describe('finding and parsing the project pyright config under the opt-in', () => {
  it('says a config could not be parsed instead of calling it missing', () => {
    expect(() => snapshotConfig({ 'pyrightconfig.json': '{ "include": [' })).toThrow(
      new RegExp(
        [
          '^The pyright config .*pyrightconfig\\.json could not be parsed \\(.+\\):',
          'fix it, or remove "project" from tools\\.pyright\\.precedence\\.',
          'See https://\\S+#a-project-tool-config-is-missing-or-broken$',
        ].join(' '),
        'u',
      ),
    );
  });

  it('says so for a malformed pyproject table too', () => {
    expect(() => snapshotConfig({ 'pyproject.toml': '[tool.pyright\nx = 1\n' })).toThrow(
      /could not be parsed/u,
    );
  });

  it('looks in the parent directories up to the repository root', () => {
    const repository = fakes.project({
      '.git/HEAD': 'ref: refs/heads/main\n',
      'pyrightconfig.json': '{ "pythonVersion": "3.9", "extraPaths": ["shared"] }',
      'services/api/src/pkg/a.py': '',
    });
    const head = path.join(repository, 'services/api');
    const base = fakes.project({});
    mkdirSync(path.join(base, 'services/api'), { recursive: true });
    const snapshot = path.join(base, 'services/api');
    const { context } = fakes.contextFor(
      snapshot,
      {},
      { toolPrecedence: LISTED, policyRoot: head },
    );

    const config = pyrightConfig(context, 'pyright');

    expect(config.pythonVersion).toBe('3.9');
    expect(config.extraPaths).toEqual([path.join(base, 'shared'), snapshot]);
  });

  it('stops at the project root when there is no repository above it', () => {
    const outer = fakes.project({ 'pyrightconfig.json': '{ "pythonVersion": "3.9" }' });
    const head = path.join(outer, 'inner');
    mkdirSync(head, { recursive: true });
    const { context } = fakes.contextFor(head, {}, { toolPrecedence: LISTED, policyRoot: head });

    expect(() => pyrightConfig(context, 'pyright')).toThrow(/is missing/u);
  });
});

describe('the pyright config files of the cache key', () => {
  it('lists the extended files, also when one of them cannot be parsed', () => {
    const root = fakes.project({
      'pyrightconfig.json': '{ "extends": "a.json" }',
      'a.json': '{ "extends": "b.json" }',
      'b.json': '{ "extends": ',
    });

    expect(pythonConfigFiles(root)).toEqual([
      path.join(root, 'pyrightconfig.json'),
      path.join(root, 'a.json'),
      path.join(root, 'b.json'),
    ]);
  });
});
