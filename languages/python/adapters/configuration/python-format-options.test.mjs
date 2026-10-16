import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatterConventionArguments } from './python-format-options.mjs';

const roots = [];
const all = { 'python.quotes': 'single', 'python.lineLength': '79', 'python.indentation': '2' };
const ALL_RUFF_ARGUMENTS = [
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

const ruffArguments = (files, conventions = all) =>
  formatterConventionArguments({ formatter: 'ruff', conventions, projectRoot: project(files) });

describe('ruff format', () => {
  it('follows every convention when the project configures nothing', () => {
    expect(ruffArguments({})).toEqual(ALL_RUFF_ARGUMENTS);
    expect(ruffArguments({ 'pyproject.toml': '[tool.ruff.lint]\nselect = ["E"]\n' })).toEqual(
      ALL_RUFF_ARGUMENTS,
    );
  });

  it('passes nothing when no convention differs from the formatter defaults', () => {
    expect(ruffArguments({}, {})).toEqual([]);
  });

  it.each([
    ['ruff.toml', 'line-length = 100\n'],
    ['.ruff.toml', 'line_length = 100\n'],
    ['pyproject.toml', '[tool.ruff]\nline-length = 100\n'],
  ])('leaves the line length to %s', (file, text) => {
    expect(ruffArguments({ [file]: text })).toEqual(ALL_RUFF_ARGUMENTS.slice(2));
  });

  it.each([
    ['a format table', '[format]\nquote-style = "double"\n'],
    ['a dotted key', 'format.quote-style = "double"\n'],
    ['an inline table', 'format = { quote-style = "double", docstring-code-format = true }\n'],
  ])('leaves the quotes to %s of ruff.toml', (_name, text) => {
    expect(ruffArguments({ 'ruff.toml': text })).toEqual([
      ...ALL_RUFF_ARGUMENTS.slice(0, 2),
      ...ALL_RUFF_ARGUMENTS.slice(4),
    ]);
  });

  it.each([['indent-width = 4\n'], ['[format]\nindent-style = "tab"\n']])(
    'leaves the indentation to %j',
    (text) => {
      expect(ruffArguments({ 'ruff.toml': text })).toEqual(ALL_RUFF_ARGUMENTS.slice(0, 4));
    },
  );

  it('leaves everything to a config that extends another one', () => {
    expect(ruffArguments({ 'ruff.toml': 'extend = "../ruff.toml"\n' })).toEqual([]);
  });

  it('ignores ruff tables of other tools and settings of other sections', () => {
    const files = {
      'pyproject.toml':
        '[tool.black]\nline-length = 100\n\n[tool.ruff.lint.pycodestyle]\nmax-line-length = 100\n\n[tool.isort]\nline_length = 100\n',
    };

    expect(ruffArguments(files)).toEqual(ALL_RUFF_ARGUMENTS);
  });
});

describe('black', () => {
  const blackArguments = (files, conventions = all) =>
    formatterConventionArguments({ formatter: 'black', conventions, projectRoot: project(files) });

  it('follows the line length, keeps single quotes, and has no indentation option', () => {
    expect(blackArguments({})).toEqual(['--line-length', '79', '--skip-string-normalization']);
    expect(blackArguments({}, { 'python.quotes': 'double', 'python.indentation': '2' })).toEqual(
      [],
    );
  });

  it('leaves the options the project configures to its [tool.black] table', () => {
    expect(blackArguments({ 'pyproject.toml': '[tool.black]\nline-length = 100\n' })).toEqual([
      '--skip-string-normalization',
    ]);
    expect(
      blackArguments({ 'pyproject.toml': '[tool.black]\nskip-string-normalization = false\n' }),
    ).toEqual(['--line-length', '79']);
  });

  it('does not read a ruff table', () => {
    expect(blackArguments({ 'pyproject.toml': '[tool.ruff]\nline-length = 100\n' })).toEqual([
      '--line-length',
      '79',
      '--skip-string-normalization',
    ]);
  });
});
