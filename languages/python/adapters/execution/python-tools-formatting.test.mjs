import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { onlyUnparsableFiles, runPythonTools, unformattedPaths } from '../python-tools.mjs';
import {
  callsLog,
  contextFor,
  contextWithConventions,
  project,
  readReport,
  restoreTemporaryState,
} from './test-support/python-tools-project.mjs';
import { fileURLToPath } from 'node:url';
import { RUFF_CONFIG } from '../configuration/python-ruff-config.mjs';

afterEach(restoreTemporaryState);

describe('parsing formatter output', () => {
  it('reads the files black would reformat from stderr', () => {
    const stderr =
      'would reformat /work/a.py\nwould reformat /work/b c.py\n\nOh no!\n2 files would be reformatted\n';

    expect(unformattedPaths('black', { stdout: 'would reformat /ignored.py\n', stderr })).toEqual([
      '/work/a.py',
      '/work/b c.py',
    ]);
  });
  it('reads the file headers of the ruff format diff', () => {
    const stdout = [
      '--- src/a.py',
      '+++ src/a.py',
      '@@ -1,2 +1,2 @@',
      '--- not a header',
      '+++ different',
      '--- src/b.py',
      '+++ src/b.py',
      '',
    ].join('\n');

    expect(
      unformattedPaths('ruff', { stdout, stderr: '--- ignored.py\n+++ ignored.py\n' }),
    ).toEqual(['src/a.py', 'src/b.py']);
  });
});
describe('formatter failures that are only unparsable files', () => {
  it.each([
    ['black', 123, 'error: cannot format /w/a.py: Cannot parse: 1:6\n    print "a"\n'],
    [
      'black',
      123,
      'error: cannot format /w/a.py: Cannot parse for target version Python 3.9: 1:6\n',
    ],
    ['black', 123, 'error: cannot parse for target version Python 3.15: /w/a.py:1:6\n'],
    ['ruff', 2, 'error: Failed to parse a.py:1:7: Simple statements must be separated\n'],
  ])('accepts %s exit %i for %j', (formatter, status, stderr) => {
    expect(onlyUnparsableFiles(formatter, { status, stdout: '', stderr })).toBe(true);
  });
  it.each([
    ['black', 123, 'error: cannot format /w/a.py: INTERNAL ERROR: boom\n'],
    ['black', 1, 'error: cannot format /w/a.py: Cannot parse: 1:6\n'],
    ['black', 123, ''],
    ['ruff', 2, 'error: Failed to parse a.py:1:7: x\nerror: Invalid value for --config\n'],
  ])('rejects %s exit %i for %j', (formatter, status, stderr) => {
    expect(onlyUnparsableFiles(formatter, { status, stdout: '', stderr })).toBe(false);
  });
});
describe('lint and format arguments', () => {
  it('lints for the python versions the project supports and keeps excluded paths out of every tool', () => {
    const calls = callsLog();
    const root = project({ 'pyproject.toml': '[project]\nrequires-python = ">=3.10"\n' });

    const { context, reportRoot } = contextFor(root, {}, ['legacy/**']);
    runPythonTools(context);

    expect(calls('ruff', 'check')[0].args).toEqual([
      'check',
      '--config',
      path.resolve(fileURLToPath(new URL('../', import.meta.url)), '../ruff/nitpicker-ruff.toml'),
      '--target-version',
      'py310',
      '--ignore-noqa',
      '--no-cache',
      '--extend-exclude',
      'legacy/**',
      '--output-format',
      'sarif',
      '--output-file',
      path.join(reportRoot, 'ruff.sarif'),
      '.',
    ]);
    expect(calls('ruff', 'format')[0].args).toEqual([
      'format',
      '--check',
      '--diff',
      '--no-cache',
      '--isolated',
      '--target-version',
      'py310',
      '--line-length',
      '88',
      '--config',
      'format.quote-style = "double"',
      '--config',
      'indent-width = 4',
      '--extend-exclude',
      'legacy/**',
      '.',
    ]);
  });
  it('gives black the excluded globs as one regular expression', () => {
    const calls = callsLog();
    const root = project({ 'pyproject.toml': '[tool.black]\n' });

    runPythonTools(contextFor(root, {}, ['legacy/**', 'gen']).context);

    const { args } = calls('black', '--check')[0];
    expect(args[args.indexOf('--extend-exclude') + 1]).toBe(
      '^/(?:legacy/.*)(?:/.*)?/?$|^/(?:gen)(?:/.*)?/?$',
    );
  });
  it.each(['ruff', 'black'])('skips the files %s cannot parse', (formatter) => {
    const root = project({
      'unparsable.txt': 'legacy/old.py\n',
      'unformatted.txt': 'src/demo/a.py\n',
    });
    const { context, reportRoot } = contextFor(root, { formatter });

    expect(runPythonTools(context)).toEqual([]);
    expect(readReport(reportRoot, 'format.txt')).toMatch(/src\/demo\/a\.py$/);
  });
  it('still fails when the formatter exits with its failure status for another reason', () => {
    const root = project({ 'fail.json': JSON.stringify({ 'ruff format': 'invalid config' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'format-failed',
        message: 'ruff format exited 2 in the virtualenv environment:\ninvalid config',
      },
    ]);
  });
});

describe('formatter arguments from the conventions followed', () => {
  const followed = {
    'python.quotes': 'single',
    'python.lineLength': '100',
    'python.indentation': '2',
  };

  it('hands ruff format the measured quotes, line length and indentation', () => {
    const calls = callsLog();
    const root = project({ 'pyproject.toml': '[project]\nname = "demo"\n' });

    runPythonTools(contextWithConventions(root, followed).context);

    expect(calls('ruff', 'format')[0].args).toEqual([
      'format',
      '--check',
      '--diff',
      '--no-cache',
      '--isolated',
      '--target-version',
      'py38',
      '--line-length',
      '100',
      '--config',
      'format.quote-style = "single"',
      '--config',
      'indent-width = 2',
      '.',
    ]);
  });
  it('hands black the line length and keeps its quotes when the project uses single quotes', () => {
    const calls = callsLog();
    const root = project({ 'pyproject.toml': '[tool.black]\n' });

    const { context, reportRoot } = contextWithConventions(root, followed);
    runPythonTools(context);

    const { args } = calls('black', '--check')[0];
    expect(args).toEqual([
      '--check',
      '--config',
      path.join(reportRoot, 'nitpicker-black.toml'),
      '--line-length',
      '100',
      '--skip-string-normalization',
      '--target-version',
      'py38',
      '.',
    ]);
    expect(readReport(reportRoot, 'nitpicker-black.toml')).toBe('');
  });
  it('keeps the project ruff config out unless it is listed', () => {
    const calls = callsLog();
    const root = project({
      'pyproject.toml': '[tool.ruff]\nline-length = 120\n',
    });

    runPythonTools(contextWithConventions(root, followed).context);

    expect(calls('ruff', 'format')[0].args.slice(0, 5)).toEqual([
      'format',
      '--check',
      '--diff',
      '--no-cache',
      '--isolated',
    ]);
  });
  it('leaves the formatter alone for the options the project configures itself once it is listed', () => {
    const calls = callsLog();
    const root = project({
      'pyproject.toml':
        '[tool.ruff]\nline-length = 120\n\n[tool.ruff.format]\nquote-style = "double"\n',
    });

    runPythonTools(
      contextWithConventions(
        root,
        { ...followed, 'python.lineLength': '120' },
        { ruff: ['project', 'nitpicker'] },
      ).context,
    );

    expect(calls('ruff', 'format')[0].args).toEqual([
      'format',
      '--check',
      '--diff',
      '--no-cache',
      '--config',
      path.join(root, 'pyproject.toml'),
      '--target-version',
      'py38',
      '--config',
      'indent-width = 2',
      '.',
    ]);
  });

  it('formats at the followed line length when the project config says another one', () => {
    const calls = callsLog();
    const root = project({ 'pyproject.toml': '[tool.ruff]\nline-length = 160\n' });

    runPythonTools(
      contextWithConventions(root, followed, { ruff: ['project', 'nitpicker'] }).context,
    );

    expect(calls('ruff', 'format')[0].args).toEqual([
      'format',
      '--check',
      '--diff',
      '--no-cache',
      '--config',
      path.join(root, 'pyproject.toml'),
      '--target-version',
      'py38',
      '--line-length',
      '100',
      '--config',
      'format.quote-style = "single"',
      '--config',
      'indent-width = 2',
      '.',
    ]);
  });
});
describe('the ruff config for the installed ruff', () => {
  const rule = (code, status = { Stable: { since: '0.1.0' } }) => ({ code, status });
  const selected = (path) =>
    [...readFileSync(path, 'utf8').matchAll(/^\s*"(RUF\d+)",$/gm)].map((match) => match[1]);

  it('keeps the preset file when ruff knows every rule it selects', () => {
    const calls = callsLog();
    const everyRule = selected(RUFF_CONFIG).map((code) => rule(code));
    const root = project({ 'ruff-rules.json': JSON.stringify(everyRule) });

    runPythonTools(contextFor(root).context);

    expect(calls('ruff', 'check')[0].args[2]).toBe(RUFF_CONFIG);
  });
  it('drops the rules the installed ruff still has in preview', () => {
    const everyRule = selected(RUFF_CONFIG).map((code) =>
      code === 'RUF071'
        ? { code, preview: true, status: { Preview: { since: '0.15.6' } } }
        : rule(code),
    );
    const root = project({ 'ruff-rules.json': JSON.stringify(everyRule) });
    const { context, reportRoot } = contextFor(root);

    runPythonTools(context);

    const filtered = readFileSync(path.join(reportRoot, 'nitpicker-ruff.toml'), 'utf8');
    expect(filtered).toBe(readFileSync(RUFF_CONFIG, 'utf8').replace('  "RUF071",\n', ''));
  });
  it('drops the rules an older ruff does not know instead of failing on them', () => {
    const calls = callsLog();
    const root = project({ 'ruff-rules.json': JSON.stringify([rule('RUF005'), rule('RUF006')]) });
    const { context, reportRoot } = contextFor(root);

    runPythonTools(context);

    const config = path.join(reportRoot, 'nitpicker-ruff.toml');
    const sourceFiles = calls('ruff', 'check').find(({ args }) => args.includes('--show-files'));
    const expected = readFileSync(RUFF_CONFIG, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*"RUF\d+",$/.test(line) || /RUF00[56]/.test(line))
      .join('\n');
    expect(calls('ruff', 'check')[0].args[2]).toBe(config);
    expect(sourceFiles.args[3]).toBe(config);
    expect(readFileSync(config, 'utf8')).toBe(expected);
  });
});
