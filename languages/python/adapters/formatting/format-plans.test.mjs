import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from '../test-support/scratch.mjs';
import { formatterPlan } from './format-command.mjs';

const scratch = createScratch();

afterEach(scratch.cleanup);

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

const project = (files = {}) => scratch.write(scratch.directory(), files);

const ruffPlan = (root, settings) =>
  formatterPlan({
    formatter: 'ruff',
    policyRoot: root,
    root,
    targetVersion: 'py310',
    ...settings,
  });

const blackPlan = (root, settings) =>
  formatterPlan({
    formatter: 'black',
    policyRoot: root,
    root,
    reportRoot: scratch.directory(),
    targetVersion: 'py310',
    ...settings,
  });

describe('ruff without an opt-in', () => {
  it('ignores the project config and passes every option, the formatter defaults included', () => {
    const root = project({ 'ruff.toml': 'line-length = 120\n' });

    expect(ruffPlan(root, {}).options).toEqual([
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
    expect(ruffPlan(root, { conventions: followed }).options).toEqual([
      '--isolated',
      '--target-version',
      'py310',
      ...FOLLOWED_FLAGS,
    ]);
  });

  it('prints a runnable command with every flag', () => {
    expect(ruffPlan(project(), { conventions: followed }).command).toBe(
      "ruff format --isolated --target-version py310 --line-length 79 --config 'format.quote-style = \"single\"' --config 'indent-width = 2' .",
    );
  });

  it('follows tabs through the formatter table', () => {
    expect(ruffPlan(project(), { conventions: { 'python.indentation': 'tab' } }).options).toEqual([
      '--isolated',
      '--target-version',
      'py310',
      '--line-length',
      '88',
      '--config',
      'format.quote-style = "double"',
      '--config',
      'format.indent-style = "tab"',
    ]);
  });

  it('keeps what the project excludes, resolved from the config file, and its target version', () => {
    const root = project({
      'ruff.toml':
        'exclude = ["generated"]\nextend-exclude = ["legacy/*.py"]\nforce-exclude = true\ntarget-version = "py39"\n',
    });

    expect(ruffPlan(root, { exclude: ['vendor/**'] }).options).toEqual([
      '--isolated',
      '--target-version',
      'py39',
      '--line-length',
      '88',
      '--config',
      'format.quote-style = "double"',
      '--config',
      'indent-width = 4',
      '--exclude',
      'generated',
      '--extend-exclude',
      'legacy/*.py',
      '--force-exclude',
      '--extend-exclude',
      'vendor/**',
    ]);
    expect(ruffPlan(root, { exclude: ['vendor/**'] }).command).not.toContain('vendor');
  });

  it('anchors a path pattern of a config above the project at that config', () => {
    const root = project({
      '.git/HEAD': '',
      'pyproject.toml': '[tool.ruff]\nexclude = ["svc/generated/*.py", "gen.py"]\n',
      'svc/a.py': '',
    });
    const service = path.join(root, 'svc');
    const run = path.join(scratch.directory(), 'svc');

    expect(ruffPlan(service, { root: run }).options.slice(-4)).toEqual([
      '--exclude',
      path.join(path.dirname(run), 'svc/generated/*.py').split(path.sep).join('/'),
      '--exclude',
      'gen.py',
    ]);
    expect(ruffPlan(service, { root: service }).options.slice(-4)).toEqual([
      '--exclude',
      path.join(root, 'svc/generated/*.py').split(path.sep).join('/'),
      '--exclude',
      'gen.py',
    ]);
  });
});

describe('ruff with the project listed', () => {
  const precedence = ['project', 'nitpicker'];

  it('leaves the options the project sets to its config and fills the rest', () => {
    const root = project({ 'ruff.toml': 'line-length = 120\n[format]\nquote-style = "double"\n' });
    const file = path.join(root, 'ruff.toml');

    expect(ruffPlan(root, { precedence, conventions: followed }).options).toEqual([
      '--config',
      file,
      '--target-version',
      'py310',
      '--config',
      'indent-width = 2',
    ]);
    expect(ruffPlan(root, { precedence: ['project'], conventions: {} }).options).toEqual([
      '--config',
      file,
      '--target-version',
      'py310',
      '--config',
      'indent-width = 4',
    ]);
  });

  it('leaves the target version to a config that sets it', () => {
    const root = project({ 'ruff.toml': 'target-version = "py39"\n' });

    expect(ruffPlan(root, { precedence }).options).not.toContain('--target-version');
  });

  it('lets the conventions win when nitpicker is listed first, switching tabs off if it must', () => {
    const root = project({ 'ruff.toml': 'line-length = 120\n[format]\nindent-style = "tab"\n' });

    expect(
      ruffPlan(root, { precedence: ['nitpicker', 'project'], conventions: followed }).options,
    ).toEqual([
      '--config',
      path.join(root, 'ruff.toml'),
      '--target-version',
      'py310',
      ...FOLLOWED_FLAGS,
      '--config',
      'format.indent-style = "space"',
    ]);
  });

  it('adds the exclusions of nitpicker to the ones of the config', () => {
    const root = project({ 'ruff.toml': 'extend-exclude = ["a"]\n' });

    expect(ruffPlan(root, { precedence, exclude: ['b/**'] }).options.slice(-2)).toEqual([
      '--extend-exclude',
      'b/**',
    ]);
  });

  it('fails when the project has no ruff config, saying how to fix it', () => {
    const root = project({ 'pyproject.toml': '[tool.black]\nline-length = 100\n' });

    expect(() => ruffPlan(root, { precedence })).toThrow(
      '"tools.ruff.precedence" lists "project" but a ruff config (.ruff.toml, ruff.toml, or pyproject.toml with a [tool.ruff] table; searched ' +
        `${root} and its parents) is missing: create it, or remove "project" from tools.ruff.precedence`,
    );
  });

  it('prints the file it uses, relative to the project', () => {
    const root = project({ 'pyproject.toml': '[tool.ruff]\nindent-width = 2\n' });

    expect(ruffPlan(root, { precedence }).command).toBe(
      'ruff format --config pyproject.toml --target-version py310 --line-length 88 --config \'format.quote-style = "double"\' .',
    );
  });
});

describe('black without an opt-in', () => {
  it('runs with an empty config and the options on the command line', () => {
    const root = project({ 'pyproject.toml': '[tool.black]\nline-length = 120\n' });

    const { options } = blackPlan(root, { conventions: followed });

    expect(options.slice(0, 1)).toEqual(['--config']);
    expect(readFileSync(options[1], 'utf8')).toBe('');
    expect(options.slice(2)).toEqual([
      '--line-length',
      '79',
      '--skip-string-normalization',
      '--target-version',
      'py310',
    ]);
  });

  it('prints a runnable command, an empty file standing in for the config', () => {
    expect(blackPlan(project(), { conventions: followed }).command).toBe(
      'black --config <empty file> --line-length 79 --skip-string-normalization --target-version py310 .',
    );
  });

  it('normalizes strings and uses 88 columns without conventions', () => {
    expect(blackPlan(project(), {}).options.slice(2)).toEqual([
      '--line-length',
      '88',
      '--target-version',
      'py310',
    ]);
  });

  it('keeps what the project excludes and the target versions it names', () => {
    const root = project({
      'pyproject.toml':
        '[tool.black]\nexclude = "/gen/"\nextend-exclude = "/old/"\nforce-exclude = "/x/"\ntarget-version = ["py38", "py39"]\n',
    });

    const plan = blackPlan(root, { exclude: ['vendor/**'] });

    expect(plan.options.slice(2)).toEqual([
      '--line-length',
      '88',
      '--target-version',
      'py38',
      '--target-version',
      'py39',
      '--exclude',
      '/gen/',
      '--force-exclude',
      '/x/',
      '--extend-exclude',
      '(?:/old/)|(?:^/(?:vendor/.*)(?:/.*)?/?$)',
    ]);
    expect(plan.command).toBe(
      'black --config <empty file> --line-length 88 --target-version py38 --target-version py39 --exclude /gen/ --force-exclude /x/ --extend-exclude /old/ .',
    );
  });
});

describe('black with the project listed', () => {
  const precedence = ['project'];

  it('uses the project table and fills what it leaves out', () => {
    const root = project({ 'pyproject.toml': '[tool.black]\nline-length = 120\n' });

    expect(blackPlan(root, { precedence, conventions: followed }).options).toEqual([
      '--config',
      path.join(root, 'pyproject.toml'),
      '--skip-string-normalization',
      '--target-version',
      'py310',
    ]);
  });

  it('leaves the target to a project that declares requires-python or target-version', () => {
    const declared = project({
      'pyproject.toml': '[project]\nrequires-python = ">=3.9"\n[tool.black]\nline-length = 100\n',
    });

    expect(blackPlan(declared, { precedence }).options).not.toContain('--target-version');
  });

  it('takes the nearest pyproject.toml even without a [tool.black] table', () => {
    const root = project({ '.git/HEAD': '', 'app/pyproject.toml': '[project]\nname = "app"\n' });

    expect(blackPlan(path.join(root, 'app'), { precedence }).command).toBe(
      'black --config pyproject.toml --line-length 88 --target-version py310 .',
    );
  });

  it('fails when there is no pyproject.toml, saying how to fix it', () => {
    const root = project({ '.git/HEAD': '' });

    expect(() => blackPlan(root, { precedence })).toThrow(
      `"tools.black.precedence" lists "project" but a pyproject.toml (searched ${root} and its parents) is missing: create it, or remove "project" from tools.black.precedence`,
    );
  });

  it('keeps the extend-exclude of the project next to the one of nitpicker', () => {
    const root = project({ 'pyproject.toml': '[tool.black]\nextend-exclude = "/old/"\n' });

    expect(blackPlan(root, { precedence, exclude: ['vendor'] }).options.slice(-2)).toEqual([
      '--extend-exclude',
      '(?:/old/)|(?:^/(?:vendor)(?:/.*)?/?$)',
    ]);
  });
});
