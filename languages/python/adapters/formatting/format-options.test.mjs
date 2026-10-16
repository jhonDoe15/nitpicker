import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatterPlan } from './format-options.mjs';
import { readBlackConfig, readRuffConfig } from './project-format-config.mjs';

const roots = [];
const followed = {
  'python.quotes': 'single',
  'python.lineLength': '79',
  'python.indentation': '2',
};
const FOLLOWED_FLAGS = [
  '--line-length',
  '79',
  '--config',
  'format.quote-style = "single"',
  '--config',
  'indent-width = 2',
];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-format-options-')));
  roots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

const plan = (root, settings) =>
  formatterPlan({
    formatter: 'ruff',
    policyRoot: root,
    reportRoot: root,
    targetVersion: 'py310',
    ...settings,
  });

describe('ruff without an opt-in', () => {
  it('ignores the project config and passes every option, the formatter defaults included', () => {
    const root = project({ 'ruff.toml': 'line-length = 120\n' });

    expect(plan(root, {}).options).toEqual([
      '--isolated',
      '--target-version',
      'py310',
      '--line-length',
      '88',
      '--config',
      'format.quote-style = "double"',
      '--config',
      'indent-width = 4',
    ]);
    expect(plan(root, { conventions: followed }).options).toEqual([
      '--isolated',
      '--target-version',
      'py310',
      ...FOLLOWED_FLAGS,
    ]);
  });

  it('tells how to format and how to opt in', () => {
    expect(plan(project(), { conventions: followed }).advice).toBe(
      "Format with `ruff format --isolated --target-version py310 --line-length 79 --config 'format.quote-style = \"single\"' --config 'indent-width = 2' .`. " +
        'To use your ruff config instead, add "tools": { "ruff": { "precedence": ["project", "nitpicker"] } } to nitpicker.config.json.',
    );
  });
});

describe('ruff with the project listed', () => {
  const precedence = ['project', 'nitpicker'];

  it('leaves the options the project sets to its config and fills the rest', () => {
    const root = project({ 'ruff.toml': 'line-length = 120\n[format]\nquote-style = "double"\n' });
    const file = path.join(root, 'ruff.toml');

    expect(plan(root, { precedence, conventions: followed }).options).toEqual([
      '--config',
      file,
      '--config',
      'indent-width = 2',
    ]);
    expect(plan(root, { precedence: ['project'], conventions: {} }).options).toEqual([
      '--config',
      file,
      '--config',
      'indent-width = 4',
    ]);
  });

  it('lets the conventions win when nitpicker is listed first', () => {
    const root = project({ 'ruff.toml': 'line-length = 120\n' });

    expect(
      plan(root, { precedence: ['nitpicker', 'project'], conventions: followed }).options,
    ).toEqual(['--config', path.join(root, 'ruff.toml'), ...FOLLOWED_FLAGS]);
  });

  it('passes the conventions through when the project has no ruff config', () => {
    const root = project({ 'pyproject.toml': '[tool.black]\nline-length = 100\n' });

    expect(plan(root, { precedence }).options.slice(0, 1)).toEqual(['--isolated']);
  });

  it('says which file it uses', () => {
    const root = project({ 'pyproject.toml': '[tool.ruff]\nindent-width = 2\n' });

    expect(plan(root, { precedence }).advice).toBe(
      'Nitpicker uses pyproject.toml for the options it sets. Format with `ruff format --config pyproject.toml --line-length 88 --config \'format.quote-style = "double"\' .`.',
    );
  });
});

describe('the ruff config the project has', () => {
  it('takes .ruff.toml before ruff.toml before pyproject.toml, as ruff does', () => {
    const files = {
      'pyproject.toml': '[tool.ruff]\nline-length = 100\n',
      'ruff.toml': 'line-length = 110\n',
      '.ruff.toml': 'line-length = 120\n',
    };
    const root = project(files);

    expect(readRuffConfig(root)).toEqual({
      file: path.join(root, '.ruff.toml'),
      set: { lineLength: 120 },
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
      set: { lineLength: 99 },
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

  it('follows extend, the child winning over the config it extends', () => {
    const root = project({
      'base/ruff.toml': 'line-length = 120\nindent-width = 2\n',
      'ruff.toml': 'extend = "base/ruff.toml"\nline-length = 100\n',
    });

    expect(readRuffConfig(root).set).toEqual({ lineLength: 100, indentation: 2 });
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
});

describe('black', () => {
  const blackPlan = (root, settings) =>
    formatterPlan({ formatter: 'black', policyRoot: root, reportRoot: root, ...settings });

  it('gets its own config file and ignores the [tool.black] table', () => {
    const root = project({ 'pyproject.toml': '[tool.black]\nline-length = 120\n' });

    const { options, advice } = blackPlan(root, { conventions: followed });

    expect(options).toEqual(['--config', path.join(root, 'nitpicker-black.toml')]);
    expect(readFileSync(options[1], 'utf8')).toBe(
      '[tool.black]\nline-length = 79\nskip-string-normalization = true\n',
    );
    expect(advice).toBe(
      'Nitpicker checks with black line-length 79 and string normalization off and ignores your [tool.black] table. Put the same settings in [tool.black] and add "tools": { "black": { "precedence": ["project", "nitpicker"] } } to nitpicker.config.json, then run black.',
    );
  });

  it('normalizes strings and uses 88 columns without conventions', () => {
    const root = project();

    expect(readFileSync(blackPlan(root, {}).options[1], 'utf8')).toBe(
      '[tool.black]\nline-length = 88\nskip-string-normalization = false\n',
    );
  });

  it('uses the project table when listed, and fills what it leaves out', () => {
    const root = project({ 'pyproject.toml': '[tool.black]\nline-length = 120\n' });
    const file = path.join(root, 'pyproject.toml');

    expect(blackPlan(root, { precedence: ['project'], conventions: followed }).options).toEqual([
      '--config',
      file,
      '--skip-string-normalization',
    ]);
    expect(
      blackPlan(root, { precedence: ['nitpicker', 'project'], conventions: followed }).options,
    ).toEqual(['--config', file, '--line-length', '79', '--skip-string-normalization']);
    expect(readBlackConfig(root).set).toEqual({ lineLength: 120 });
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
});
