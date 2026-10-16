import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from '../test-support/scratch.mjs';
import {
  projectFormatConfigFiles,
  readBlackConfig,
  readRuffConfig,
} from './project-format-config.mjs';

const scratch = createScratch();

afterEach(scratch.cleanup);

const project = (files) => scratch.write(scratch.directory(), files);

describe('the ruff config the project has', () => {
  it('takes .ruff.toml before ruff.toml before pyproject.toml, as ruff does', () => {
    const root = project({
      'pyproject.toml': '[tool.ruff]\nline-length = 100\n',
      'ruff.toml': 'line-length = 110\n',
      '.ruff.toml': 'line-length = 120\n',
    });

    expect(readRuffConfig(root)).toEqual({
      file: path.join(root, '.ruff.toml'),
      files: [path.join(root, '.ruff.toml')],
      set: { lineLength: 120 },
      scope: { extendExclude: [] },
    });
    rmSync(path.join(root, '.ruff.toml'));
    expect(readRuffConfig(root).set).toEqual({ lineLength: 110 });
    rmSync(path.join(root, 'ruff.toml'));
    expect(readRuffConfig(root).set).toEqual({ lineLength: 100 });
  });

  it('skips a pyproject.toml without a ruff table and walks up to the repository root', () => {
    const root = project({
      '.git/HEAD': '',
      'ruff.toml': 'line-length = 99\n',
      'packages/app/pyproject.toml': '[project]\nname = "app"\n',
    });

    expect(readRuffConfig(path.join(root, 'packages/app'))).toEqual({
      file: path.join(root, 'ruff.toml'),
      files: [path.join(root, 'ruff.toml')],
      set: { lineLength: 99 },
      scope: { extendExclude: [] },
    });
  });

  it('stops at the repository root', () => {
    const outer = project({ 'ruff.toml': 'line-length = 99\n', 'repo/.git/HEAD': '' });

    expect(readRuffConfig(path.join(outer, 'repo'))).toBeUndefined();
  });

  it('reads the quote style, the indentation and the formatter table', () => {
    const root = project({
      'ruff.toml': 'indent-width = 3\n[format]\nquote-style = "preserve"\nindent-style = "space"\n',
    });

    expect(readRuffConfig(root).set).toEqual({ indentation: 3, quotes: 'preserve' });
    writeFileSync(path.join(root, 'ruff.toml'), '[format]\nindent-style = "tab"\n');
    expect(readRuffConfig(root).set).toEqual({ indentation: 'tab' });
  });

  it('follows extend, the child winning over the config it extends, and lists every file', () => {
    const root = project({
      'base/ruff.toml': 'line-length = 120\nindent-width = 2\n',
      'ruff.toml': 'extend = "base/ruff.toml"\nline-length = 100\n',
    });

    const config = readRuffConfig(root);

    expect(config.set).toEqual({ lineLength: 100, indentation: 2 });
    expect(config.files).toEqual([path.join(root, 'ruff.toml'), path.join(root, 'base/ruff.toml')]);
  });

  it('survives an extend cycle and a missing parent', () => {
    const root = project({
      'a.toml': 'extend = "b.toml"\nline-length = 90\n',
      'b.toml': 'extend = "a.toml"\n',
      'ruff.toml': 'extend = "a.toml"\n',
      'pkg/ruff.toml': 'extend = "../missing.toml"\nline-length = 70\n',
    });

    expect(readRuffConfig(root).set).toEqual({ lineLength: 90 });
    expect(readRuffConfig(path.join(root, 'pkg')).set).toEqual({ lineLength: 70 });
  });

  it('fails with the file name for a config that is not TOML', () => {
    const root = project({ 'ruff.toml': 'line-length = \n' });

    expect(() => readRuffConfig(root)).toThrow(`${path.join(root, 'ruff.toml')} is not valid TOML`);
  });

  it('reads the keys that decide which files and which Python version', () => {
    const root = project({
      'ruff.toml':
        'exclude = ["generated"]\nextend-exclude = ["legacy/*.py"]\nforce-exclude = true\ntarget-version = "py39"\n',
    });

    expect(readRuffConfig(root).scope).toEqual({
      exclude: [{ pattern: 'generated', directory: root }],
      extendExclude: [{ pattern: 'legacy/*.py', directory: root }],
      forceExclude: true,
      targetVersion: 'py39',
    });
  });

  it('merges the scope keys over extend: exclude and the target version from the child, extend-exclude from both', () => {
    const root = project({
      'base/ruff.toml': 'exclude = ["old"]\nextend-exclude = ["a"]\ntarget-version = "py38"\n',
      'ruff.toml': 'extend = "base/ruff.toml"\nextend-exclude = ["b"]\ntarget-version = "py311"\n',
    });

    const { scope } = readRuffConfig(root);

    expect(scope.exclude).toEqual([{ pattern: 'old', directory: path.join(root, 'base') }]);
    expect(scope.extendExclude.map(({ pattern }) => pattern)).toEqual(['b', 'a']);
    expect(scope.targetVersion).toBe('py311');
  });
});

describe('the black config the project has', () => {
  it('is the nearest pyproject.toml, even without a [tool.black] table, as black finds it', () => {
    const root = project({
      '.git/HEAD': '',
      'pyproject.toml': '[tool.black]\nline-length = 120\n',
      'app/pyproject.toml': '[project]\nname = "app"\n',
    });

    expect(readBlackConfig(path.join(root, 'app'))).toEqual({
      file: path.join(root, 'app/pyproject.toml'),
      files: [path.join(root, 'app/pyproject.toml')],
      hasTable: false,
      set: {},
      scope: { requiresPython: false },
    });
    expect(readBlackConfig(root)).toEqual({
      file: path.join(root, 'pyproject.toml'),
      files: [path.join(root, 'pyproject.toml')],
      hasTable: true,
      set: { lineLength: 120 },
      scope: { requiresPython: false },
    });
  });

  it('is nothing without a pyproject.toml up to the repository root', () => {
    const outer = project({ 'pyproject.toml': '[tool.black]\n', 'repo/.git/HEAD': '' });

    expect(readBlackConfig(path.join(outer, 'repo'))).toBeUndefined();
  });

  it('reads the string normalization setting', () => {
    const root = project({ 'pyproject.toml': '[tool.black]\nskip-string-normalization = true\n' });

    expect(readBlackConfig(root).set).toEqual({ quotes: 'preserve' });
    writeFileSync(
      path.join(root, 'pyproject.toml'),
      '[tool.black]\nskip_string_normalization = false\n',
    );
    expect(readBlackConfig(root).set).toEqual({ quotes: 'normalize' });
  });

  it('reads the exclusions, the target versions and whether requires-python is declared', () => {
    const root = project({
      'pyproject.toml':
        '[project]\nrequires-python = ">=3.9"\n[tool.black]\nexclude = "/gen/"\nextend_exclude = "/old/"\nforce-exclude = "/x/"\ntarget-version = ["py39", "py310"]\n',
    });

    expect(readBlackConfig(root).scope).toEqual({
      exclude: '/gen/',
      extendExclude: '/old/',
      forceExclude: '/x/',
      targetVersions: ['py39', 'py310'],
      requiresPython: true,
    });
  });
});

describe('the files the format config cache key covers', () => {
  it('lists the config files the formatters read', () => {
    const root = project({
      'ruff.toml': 'extend = "base.toml"\n',
      'base.toml': 'line-length = 100\n',
    });

    expect(projectFormatConfigFiles(root)).toEqual([
      path.join(root, 'ruff.toml'),
      path.join(root, 'base.toml'),
    ]);
  });

  it('still lists a config file that does not parse, so editing it changes the key', () => {
    const root = project({ 'ruff.toml': 'line-length = \n', 'pyproject.toml': '[tool.black]\n' });

    expect(projectFormatConfigFiles(root)).toEqual([
      path.join(root, 'ruff.toml'),
      path.join(root, 'pyproject.toml'),
    ]);
  });

  it('lists a broken file that a config extends', () => {
    const root = project({
      'ruff.toml': 'extend = "base.toml"\n',
      'base.toml': 'line-length = \n',
    });

    expect(projectFormatConfigFiles(root)).toEqual([
      path.join(root, 'ruff.toml'),
      path.join(root, 'base.toml'),
    ]);
  });
});
