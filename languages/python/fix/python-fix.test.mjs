import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../core/fix/run-fix.mjs';
import { BLACK_DEFAULT_EXCLUDES } from './python-fix-commands.mjs';
import { fakePythonTools } from './test-support/fake-python-fix.mjs';

const { createGitRepository } = useGitFixtures();
const PYPROJECT = '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.9"\n';
const BLACK_PYPROJECT = `${PYPROJECT}[tool.black]\nline-length = 88\n`;
const RUFF_CONFIG = path.resolve(import.meta.dirname, '../ruff/nitpicker-ruff.toml');
const LINT_OPTIONS = [
  'check',
  '--config',
  RUFF_CONFIG,
  '--target-version',
  'py39',
  '--line-length',
  '88',
  '--no-cache',
];
const FORMAT_STYLE = [
  '--config',
  'format.quote-style = "double"',
  '--config',
  'indent-width = 4',
  '--force-exclude',
  '--stdin-filename=a.py',
  '-',
];
const ISOLATED_FORMAT = (lineLength) => [
  'format',
  '--no-cache',
  '--isolated',
  '--target-version',
  'py39',
  '--line-length',
  lineLength,
  ...FORMAT_STYLE,
];

function topic(base, changes) {
  const repository = createGitRepository(
    { 'pyproject.toml': PYPROJECT, ...base },
    { baseRef: 'base' },
  );
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changes);
  return repository;
}

function fix(repository, tools, { headPolicy = {}, config = {} } = {}) {
  return fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: tools.executeFixCommand,
    headPolicy: { exclude: [], conventions: {}, ...headPolicy },
    config: { preset: 'python', ...config },
  });
}

function read(repository, name) {
  return readFileSync(path.join(repository.root, name), 'utf8');
}

describe('--fix for Python', () => {
  it('formats the changed Python files with ruff and leaves the other files alone', () => {
    const repository = topic(
      { 'a.py': 'a = 1\n', 'unchanged.py': 'u  =  1\n', 'notes.md': 'n  m\n' },
      { 'a.py': 'a  =  2\n', 'new.py': 'n  =  1\n', 'notes.md': 'n  m  o\n', 'data.json': '{ }\n' },
    );
    const tools = fakePythonTools();

    const result = fix(repository, tools);

    expect(result).toEqual({
      fixedFiles: ['a.py', 'new.py'],
      toolErrors: [],
      notes: ['ruff format rewrote a.py, new.py'],
    });
    expect([read(repository, 'a.py'), read(repository, 'new.py')]).toEqual(['a = 2\n', 'n = 1\n']);
    expect([read(repository, 'unchanged.py'), read(repository, 'notes.md')]).toEqual([
      'u  =  1\n',
      'n  m  o\n',
    ]);
    expect(tools.operations()).toEqual([
      'python-probe',
      'ruff-fix',
      'ruff-format-fix',
      'ruff-format-fix',
      'ruff-format-fix',
    ]);
  });
  it('runs ruff check with the gate rules, only safe fixes and only on the changed files', () => {
    const repository = topic({ 'a.py': 'a = 1\n' }, { 'a.py': 'a  =  2\n', 'pkg/b.py': 'b = 1\n' });
    const tools = fakePythonTools();

    fix(repository, tools);

    const [lint] = tools.callsOf('ruff-fix');
    expect({
      command: lint.command,
      args: lint.args,
      cwd: lint.cwd,
      acceptedStatuses: lint.acceptedStatuses,
    }).toEqual({
      command: 'ruff',
      args: [...LINT_OPTIONS, '--force-exclude', '--fix', '--', 'a.py', 'pkg/b.py'],
      cwd: repository.root,
      acceptedStatuses: [0, 1],
    });
  });
  it('lists a file ruff check rewrote and does not format a file that was unformatted before the change', () => {
    const repository = topic(
      { 'legacy.py': 'l  =  1\n', 'clean.py': 'c = 1\n' },
      { 'legacy.py': 'l  =  2\n', 'clean.py': 'c = 1\nimport os\n' },
    );
    const tools = fakePythonTools({
      lintEdit: (file, source) =>
        file === 'clean.py' ? source.replace('import os\n', '') : undefined,
    });

    const result = fix(repository, tools);

    expect(result).toEqual({
      fixedFiles: ['clean.py'],
      toolErrors: [],
      notes: [
        'ruff check --fix rewrote clean.py',
        'ruff format left legacy.py as is: already unformatted before your change',
      ],
    });
    expect(read(repository, 'legacy.py')).toBe('l  =  2\n');
  });
  it('formats with Black when the project uses Black, in the same environment', () => {
    const repository = topic(
      { 'pyproject.toml': BLACK_PYPROJECT, 'a.py': 'a = 1\n' },
      { 'a.py': 'a  =  2\n' },
    );
    const tools = fakePythonTools();

    const result = fix(repository, tools);

    expect(result.notes).toEqual(['black rewrote a.py']);
    const [format] = tools.callsOf('black-fix');
    expect({
      command: format.command,
      input: format.input,
      acceptedStatuses: format.acceptedStatuses,
      args: format.args.with(2, 'black-config'),
    }).toEqual({
      command: 'black',
      input: 'a  =  2\n',
      acceptedStatuses: [0, 123],
      args: [
        '-q',
        '--config',
        'black-config',
        '--line-length',
        '88',
        '--target-version',
        'py39',
        '--force-exclude',
        `(?:${BLACK_DEFAULT_EXCLUDES})`,
        '--stdin-filename=a.py',
        '-',
      ],
    });
    expect(tools.operations()).toEqual(['python-probe', 'ruff-fix', 'black-fix', 'black-fix']);
  });
  it('honours the formatter named in the python settings', () => {
    const repository = topic({ 'a.py': 'a = 1\n' }, { 'a.py': 'a  =  2\n' });
    const tools = fakePythonTools();

    fix(repository, tools, { config: { python: { formatter: 'black' } } });

    expect(tools.operations()).toEqual(['python-probe', 'ruff-fix', 'black-fix', 'black-fix']);
  });
  it('skips excluded paths and paths outside the Python sources', () => {
    const repository = topic(
      {},
      {
        'src/a.py': 'a  =  1\n',
        'gen/api.py': 'g  =  1\n',
        'stubs/s.pyi': 's  =  1\n',
        'x.txt': 'x\n',
      },
    );
    const tools = fakePythonTools();

    const result = fix(repository, tools, { headPolicy: { exclude: ['gen/**'] } });

    expect(result.fixedFiles).toEqual(['src/a.py', 'stubs/s.pyi']);
    expect(read(repository, 'gen/api.py')).toBe('g  =  1\n');
    expect(tools.callsOf('ruff-fix')[0].args).toEqual([
      ...LINT_OPTIONS,
      '--extend-exclude',
      'gen/**',
      '--force-exclude',
      '--fix',
      '--',
      'src/a.py',
      'stubs/s.pyi',
    ]);
  });
  it('does nothing when no Python file changed', () => {
    const repository = topic({ 'a.py': 'a  =  1\n' }, { 'x.txt': 'x\n' });
    const tools = fakePythonTools();

    expect(fix(repository, tools)).toEqual({ fixedFiles: [], toolErrors: [], notes: [] });
    expect(tools.calls).toEqual([]);
  });
  it('reports files the formatter cannot parse without failing', () => {
    const repository = topic({}, { 'broken.py': 'BROKEN  \n', 'ok.py': 'ok  =  1\n' });
    const tools = fakePythonTools();

    const result = fix(repository, tools);

    expect(result).toEqual({
      fixedFiles: ['ok.py'],
      toolErrors: [],
      notes: ['ruff format rewrote ok.py', 'ruff format could not parse broken.py'],
    });
  });
  it('reports a ruff check failure as a tool error and still formats', () => {
    const repository = topic({}, { 'a.py': 'a  =  1\n' });
    const tools = fakePythonTools({ lintStatus: 2 });

    const result = fix(repository, tools);

    expect(result.fixedFiles).toEqual(['a.py']);
    expect(result.toolErrors).toEqual([
      {
        tool: 'ruff-fix',
        snapshot: 'fix',
        rule: 'fix-failed',
        message: 'ruff-fix failed: ruff check exited 2 in the PATH environment:\nruff exploded',
      },
    ]);
  });
  it('reports a formatter failure other than a parse error as a tool error', () => {
    const repository = topic({}, { 'a.py': 'a  =  1\n' });
    const tools = fakePythonTools({ formatFailure: 'error: invalid value for --line-length' });

    const result = fix(repository, tools);

    expect(result.fixedFiles).toEqual([]);
    expect(result.toolErrors).toEqual([
      {
        tool: 'ruff-format-fix',
        snapshot: 'fix',
        rule: 'fix-failed',
        message:
          'ruff-format-fix failed: ruff format exited 2 in the PATH environment:\nerror: invalid value for --line-length',
      },
    ]);
  });
  it('reports a missing environment as one tool error before running anything', () => {
    const repository = topic({}, { 'a.py': 'a  =  1\n' });
    const tools = fakePythonTools();

    const result = fix(repository, tools, { config: { python: { environment: 'missing-venv' } } });

    expect(result.fixedFiles).toEqual([]);
    const missing = path.join(repository.root, 'missing-venv');
    expect(result.toolErrors).toEqual([
      {
        tool: 'python-fix',
        snapshot: 'fix',
        rule: 'fix-failed',
        message: `No Python environment at ${missing} (${path.join(missing, 'bin')} does not exist): create it, or set "python.environment"`,
      },
    ]);
    expect(tools.operations()).toEqual([]);
  });
  it('formats with the ruff config of the project only when the tool precedence says so', () => {
    const repository = topic(
      { 'ruff.toml': 'line-length = 100\n', 'a.py': 'a = 1\n' },
      { 'a.py': 'a  =  2\n' },
    );
    const isolated = fakePythonTools();
    const layered = fakePythonTools();

    fix(repository, isolated);
    fix(repository, layered, { headPolicy: { tools: { ruff: { precedence: ['project'] } } } });

    expect(isolated.callsOf('ruff-format-fix')[0].args).toEqual(ISOLATED_FORMAT('88'));
    expect(layered.callsOf('ruff-format-fix')[0].args).toEqual([
      'format',
      '--no-cache',
      '--config',
      path.join(repository.root, 'ruff.toml'),
      '--target-version',
      'py39',
      ...FORMAT_STYLE,
    ]);
  });
  it('follows the measured conventions of the project', () => {
    const repository = topic({ 'a.py': 'a = 1\n' }, { 'a.py': 'a  =  2\n' });
    const tools = fakePythonTools();

    fix(repository, tools, { headPolicy: { conventions: { 'python.lineLength': '100' } } });

    expect(tools.callsOf('ruff-format-fix')[0].args).toEqual(ISOLATED_FORMAT('100'));
  });
  it('fixes and formats notebooks with ruff, as the gate checks them', () => {
    const repository = topic({}, { 'nb.ipynb': '{  "cells": []}\n' });
    const tools = fakePythonTools();

    const result = fix(repository, tools);

    expect(result.notes).toEqual(['ruff format rewrote nb.ipynb']);
    expect([
      tools.callsOf('ruff-fix')[0].args.at(-1),
      tools.callsOf('ruff-format-fix')[0].args.at(-2),
    ]).toEqual(['nb.ipynb', '--stdin-filename=nb.ipynb']);
  });
  it('hands notebooks to Black too, which formats them only when its jupyter extra is installed', () => {
    const repository = topic(
      { 'pyproject.toml': BLACK_PYPROJECT },
      { 'nb.ipynb': '{  "cells": []}\n', 'a.py': 'a  =  1\n' },
    );
    const tools = fakePythonTools();

    const result = fix(repository, tools);

    expect(result.notes).toEqual(['black rewrote a.py, nb.ipynb']);
    expect(
      tools.callsOf('black-fix').map(({ args }) => [args.includes('-q'), args.at(-2)]),
    ).toEqual([
      [true, '--stdin-filename=a.py'],
      [false, '--stdin-filename=nb.ipynb'],
    ]);
  });
  it('names the notebooks Black skipped because its jupyter extra is missing', () => {
    const repository = topic(
      { 'pyproject.toml': BLACK_PYPROJECT },
      { 'nb.ipynb': '{  "cells": []}\n', 'a.py': 'a  =  1\n' },
    );

    const result = fix(repository, fakePythonTools({ jupyterMissing: true }));

    expect(result).toEqual({
      fixedFiles: ['a.py'],
      toolErrors: [],
      notes: [
        'black rewrote a.py',
        'black left nb.ipynb as is: Black formats notebooks only with its jupyter extra (black[jupyter]) installed',
      ],
    });
    expect(read(repository, 'nb.ipynb')).toBe('{  "cells": []}\n');
  });
  it('names the binary a fixer could not find, in a line the console prints whole', () => {
    const repository = topic({}, { 'a.py': 'a  =  1\n' });
    const tools = fakePythonTools({ missingFormatter: true });

    expect(fix(repository, tools).toolErrors).toEqual([
      {
        tool: 'ruff-format-fix',
        snapshot: 'fix',
        rule: 'fix-failed',
        message:
          'ruff-format-fix failed: ruff was not found in the PATH environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it',
      },
    ]);
  });
  it('names changed Python paths that are symbolic links instead of following them', () => {
    const repository = topic({}, { 'a.py': 'a  =  1\n' });
    symlinkSync('a.py', path.join(repository.root, 'link.py'));

    expect(fix(repository, fakePythonTools()).notes).toEqual([
      'ruff format rewrote a.py',
      '--fix left link.py as is: symbolic links are not followed',
    ]);
  });
  it('leaves a file that is not UTF-8 text to both tools and says so', () => {
    const repository = topic({}, { 'a.py': 'a  =  1\n' });
    const latin1 = Buffer.from('s  =  "caf\u00e9"\n', 'latin1');
    writeFileSync(path.join(repository.root, 'latin.py'), latin1);
    const tools = fakePythonTools();

    const result = fix(repository, tools);

    expect(result).toEqual({
      fixedFiles: ['a.py'],
      toolErrors: [],
      notes: ['ruff format rewrote a.py', '--fix left latin.py as is: not UTF-8 text'],
    });
    expect(tools.callsOf('ruff-fix')[0].args.at(-1)).toBe('a.py');
    expect(readFileSync(path.join(repository.root, 'latin.py'))).toEqual(latin1);
  });
  it('runs the tools through uv run in a uv project', () => {
    const repository = topic({ 'uv.lock': '', '.venv/bin/.keep': '' }, { 'a.py': 'a  =  1\n' });
    const tools = fakePythonTools();

    fix(repository, tools);

    const [lint] = tools.callsOf('ruff-fix');
    expect([lint.command, lint.args.slice(0, 7)]).toEqual([
      'uv',
      ['run', '--project', repository.root, '--no-sync', '--', 'ruff', 'check'],
    ]);
  });
  it('runs the tools from the environment poetry reports in a poetry project', () => {
    const repository = topic({ 'poetry.lock': '', 'env/bin/ruff': '' }, { 'a.py': 'a  =  1\n' });
    const environment = path.join(repository.root, 'env');
    const tools = fakePythonTools({ poetryEnvironment: environment });

    const result = fix(repository, tools);

    const [poetry] = tools.callsOf('python-probe');
    const [lint] = tools.callsOf('ruff-fix');
    expect({
      notes: result.notes,
      poetry: [poetry.command, poetry.args, poetry.timeout],
      lint: [lint.command, lint.environment.VIRTUAL_ENV],
    }).toEqual({
      notes: ['ruff format rewrote a.py'],
      poetry: ['poetry', ['-C', repository.root, 'env', 'info', '--path'], 60_000],
      lint: [path.join(environment, 'bin', 'ruff'), environment],
    });
  });
  it('reports a poetry project without an environment as one tool error', () => {
    const repository = topic({ 'poetry.lock': '' }, { 'a.py': 'a  =  1\n' });
    const tools = fakePythonTools();

    const result = fix(repository, tools);

    expect({
      errors: result.toolErrors.map(({ tool }) => tool),
      operations: tools.operations(),
    }).toEqual({
      errors: ['python-fix'],
      operations: ['python-probe'],
    });
  });
  it('never touches the index or the base commit', () => {
    const repository = topic({ 'a.py': 'a = 1\n' }, { 'a.py': 'a  =  2\n' });
    const indexBefore = fixtureGit(repository.root, ['ls-files', '--stage']);

    fix(repository, fakePythonTools());

    expect(fixtureGit(repository.root, ['ls-files', '--stage'])).toBe(indexBefore);
    expect(fixtureGit(repository.root, ['show', 'base:a.py'])).toBe('a = 1\n');
  });
});
