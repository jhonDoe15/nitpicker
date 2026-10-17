import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeProjects } from '../../test-support/fake-project.mjs';
import { pyrightConfig } from './pyright-config.mjs';

const fakes = createFakeProjects();
afterEach(fakes.cleanup);

const LISTED = { pyright: ['project', 'nitpicker'] };
const NITPICKER_FIRST = { pyright: ['nitpicker', 'project'] };
const PROJECT_CONFIG = JSON.stringify({
  reportMissingImports: false,
  reportUnknownMemberType: 'none',
  typeCheckingMode: 'basic',
  enableTypeIgnoreComments: true,
  ignore: ['src/legacy'],
  include: ['src/demo'],
  exclude: ['src/gen'],
  venvPath: '.',
  venv: 'env',
  pythonVersion: '3.10',
  pythonPlatform: 'Linux',
  extraPaths: ['vendor'],
  executionEnvironments: [
    { root: 'src', extraPaths: ['stubs'], pythonVersion: '3.9', reportOptionalMemberAccess: false },
  ],
});

function configOf(files, { precedence, settings = {}, exclude = [] } = {}, checker = 'pyright') {
  const root = fakes.project(files);
  const { context, reportRoot } = fakes.contextFor(root, settings, {
    exclude,
    ...(precedence === undefined ? {} : { toolPrecedence: precedence, policyRoot: root }),
  });
  return { root, reportRoot, config: pyrightConfig(context, checker) };
}

function strictBase(root, reportRoot) {
  return {
    typeCheckingMode: 'strict',
    reportDeprecated: 'error',
    enableTypeIgnoreComments: false,
    ignore: [],
    executionEnvironments: [],
    exclude: ['**/node_modules', '**/__pycache__', '**/.*'],
    include: [path.relative(reportRoot, path.join(root, 'src'))],
    extraPaths: [path.join(root, 'src')],
  };
}

describe('pyright configuration without the opt-in', () => {
  it('keeps only the environment keys of the project file, with paths made absolute', () => {
    const { root, reportRoot, config } = configOf({ 'pyrightconfig.json': PROJECT_CONFIG });

    expect(config).toEqual({
      ...strictBase(root, reportRoot),
      venvPath: root,
      venv: 'env',
      pythonVersion: '3.10',
      pythonPlatform: 'Linux',
      extraPaths: [path.join(root, 'vendor'), path.join(root, 'src')],
      executionEnvironments: [
        {
          root: path.join(root, 'src'),
          extraPaths: [path.join(root, 'stubs'), path.join(root, 'src')],
          pythonVersion: '3.9',
        },
      ],
    });
  });

  it('reads the pyproject table, and the pyright one for basedpyright', () => {
    const files = {
      'pyproject.toml': '[tool.pyright]\nreportMissingImports = false\npythonVersion = "3.12"\n',
    };
    const pyright = configOf(files);
    const based = configOf(files, {}, 'basedpyright');

    expect(pyright.config).toEqual({
      ...strictBase(pyright.root, pyright.reportRoot),
      pythonVersion: '3.12',
    });
    expect(based.config).toEqual({
      ...strictBase(based.root, based.reportRoot),
      pythonVersion: '3.12',
    });
  });

  it('prefers the basedpyright table for basedpyright and ignores it for pyright', () => {
    const files = {
      'pyproject.toml':
        '[tool.pyright]\npythonVersion = "3.10"\n[tool.basedpyright]\npythonVersion = "3.13"\n',
    };

    expect(configOf(files, {}, 'basedpyright').config.pythonVersion).toBe('3.13');
    expect(configOf(files).config.pythonVersion).toBe('3.10');
    expect(
      configOf({ 'pyproject.toml': '[tool.basedpyright]\npythonVersion = "3.13"\n' }).config,
    ).not.toHaveProperty('pythonVersion');
  });

  it('reads a file with comments, trailing commas and a base file it extends', () => {
    const { root, config } = configOf({
      'pyrightconfig.json':
        '{\n // base\n "extends": "base/pyright-base.json", "pythonPlatform": "Darwin",\n}',
      'base/pyright-base.json':
        '{ "pythonVersion": "3.8", "reportAny": false, "extraPaths": ["lib"] }',
    });

    expect(config.pythonVersion).toBe('3.8');
    expect(config.pythonPlatform).toBe('Darwin');
    expect(config.extraPaths).toEqual([path.join(root, 'base/lib'), path.join(root, 'src')]);
    expect(config).not.toHaveProperty('reportAny');
    expect(config).not.toHaveProperty('extends');
  });

  it('points at the typings directory the project has', () => {
    const { root, config } = configOf({ 'typings/a.pyi': '' });

    expect(config.stubPath).toBe(path.join(root, 'typings'));
  });

  it('survives a config it cannot read', () => {
    const { root, reportRoot, config } = configOf({ 'pyrightconfig.json': '{ not json' });

    expect(config).toEqual(strictBase(root, reportRoot));
  });
});

describe('pyright configuration with the opt-in', () => {
  it('lets the project override only the keys it sets', () => {
    const { root, reportRoot, config } = configOf(
      { 'pyrightconfig.json': PROJECT_CONFIG },
      { precedence: LISTED },
    );

    expect(config).toEqual({
      ...strictBase(root, reportRoot),
      reportMissingImports: false,
      reportUnknownMemberType: 'none',
      typeCheckingMode: 'basic',
      enableTypeIgnoreComments: true,
      ignore: [path.join(root, 'src/legacy')],
      include: [path.relative(reportRoot, path.join(root, 'src/demo'))],
      exclude: [
        '**/node_modules',
        '**/__pycache__',
        '**/.*',
        path.relative(reportRoot, path.join(root, 'src/gen')),
      ],
      venvPath: root,
      venv: 'env',
      pythonVersion: '3.10',
      pythonPlatform: 'Linux',
      extraPaths: [path.join(root, 'vendor'), path.join(root, 'src')],
      executionEnvironments: [
        {
          root: path.join(root, 'src'),
          extraPaths: [path.join(root, 'stubs'), path.join(root, 'src')],
          pythonVersion: '3.9',
          reportOptionalMemberAccess: false,
        },
      ],
    });
  });

  it('keeps nitpicker strictness for a project that sets no strictness key', () => {
    const { root, reportRoot, config } = configOf(
      { 'pyproject.toml': '[tool.pyright]\npythonVersion = "3.11"\n' },
      { precedence: LISTED },
    );

    expect(config).toEqual({ ...strictBase(root, reportRoot), pythonVersion: '3.11' });
  });

  it('keeps the whole nitpicker configuration when it is listed first', () => {
    const { root, reportRoot, config } = configOf(
      { 'pyrightconfig.json': PROJECT_CONFIG },
      { precedence: NITPICKER_FIRST },
    );

    expect(config).toEqual({
      ...strictBase(root, reportRoot),
      venvPath: root,
      venv: 'env',
      pythonVersion: '3.10',
      pythonPlatform: 'Linux',
      extraPaths: [path.join(root, 'vendor'), path.join(root, 'src')],
      executionEnvironments: [
        {
          root: path.join(root, 'src'),
          extraPaths: [path.join(root, 'stubs'), path.join(root, 'src')],
          pythonVersion: '3.9',
        },
      ],
    });
  });

  it('names the missing config instead of silently using nitpicker alone', () => {
    expect(() => configOf({}, { precedence: LISTED })).toThrow(
      /^"tools\.pyright\.precedence" lists "project" but a pyright config \(.+\) is missing: create it/u,
    );
  });
});
