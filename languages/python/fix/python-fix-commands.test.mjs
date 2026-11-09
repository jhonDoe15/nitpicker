import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from '../adapters/test-support/scratch.mjs';
import {
  BLACK_DEFAULT_EXCLUDES,
  blackForceExclude,
  formatStdinCommand,
  lintFixCommand,
} from './python-fix-commands.mjs';
import { withPythonFixContext } from './python-fix-session.mjs';

const scratch = createScratch();

afterEach(scratch.cleanup);

const probeFailure = ({ operation }) =>
  operation === 'python-probe' ? { status: 1, stdout: '', stderr: '' } : undefined;

function inContext(files, { config = {}, headPolicy = {} } = {}, use) {
  const projectRoot = scratch.write(scratch.directory(), files);
  return withPythonFixContext(
    {
      projectRoot,
      config,
      headPolicy: { exclude: [], ...headPolicy },
      executeFixCommand: probeFailure,
    },
    (context) => use(context, projectRoot),
  );
}

const PYPROJECT = '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.9"\n';
const BLACK = `${PYPROJECT}[tool.black]\nline-length = 88\n`;
const NITPICKER_RUFF_CONFIG = path.resolve(import.meta.dirname, '../ruff/nitpicker-ruff.toml');
const RUFF_LINT_OPTIONS = [
  'ruff',
  'check',
  '--config',
  NITPICKER_RUFF_CONFIG,
  '--target-version',
  'py39',
  '--line-length',
  '88',
  '--no-cache',
];
const RUFF_FORMAT_OPTIONS = [
  '--isolated',
  '--target-version',
  'py39',
  '--line-length',
  '88',
  '--config',
  'format.quote-style = "double"',
  '--config',
  'indent-width = 4',
];

describe('lintFixCommand', () => {
  it('applies only safe fixes with the lint options of the gate, to the given files', () => {
    const command = inContext({ 'pyproject.toml': PYPROJECT }, {}, (context) =>
      lintFixCommand(context, ['a.py', 'b.py']),
    );

    expect(command).toEqual([
      ...RUFF_LINT_OPTIONS,
      '--force-exclude',
      '--fix',
      '--',
      'a.py',
      'b.py',
    ]);
  });
  it('excludes what the policy excludes', () => {
    const command = inContext(
      { 'pyproject.toml': PYPROJECT },
      { headPolicy: { exclude: ['gen/**'] } },
      (context) => lintFixCommand(context, ['a.py']),
    );

    expect(command).toEqual([
      ...RUFF_LINT_OPTIONS,
      '--extend-exclude',
      'gen/**',
      '--force-exclude',
      '--fix',
      '--',
      'a.py',
    ]);
  });
});

describe('formatStdinCommand', () => {
  it('formats one file from standard input with ruff, honouring the excludes of the project', () => {
    const command = inContext({ 'pyproject.toml': PYPROJECT }, {}, (context) =>
      formatStdinCommand(context, 'src/a.py'),
    );

    expect(command).toEqual([
      'ruff',
      'format',
      '--no-cache',
      ...RUFF_FORMAT_OPTIONS,
      '--force-exclude',
      '--stdin-filename=src/a.py',
      '-',
    ]);
  });
  it('formats one file from standard input with Black and one forced exclude pattern', () => {
    const command = inContext({ 'pyproject.toml': BLACK }, {}, (context) =>
      formatStdinCommand(context, 'src/a.py'),
    );

    const [program, quiet, configFlag, , ...rest] = command;

    expect([program, quiet, configFlag, ...rest]).toEqual([
      'black',
      '-q',
      '--config',
      '--line-length',
      '88',
      '--target-version',
      'py39',
      '--force-exclude',
      `(?:${BLACK_DEFAULT_EXCLUDES})`,
      '--stdin-filename=src/a.py',
      '-',
    ]);
  });
});

describe('a file name that starts with a dash', () => {
  it('stays a file name for ruff and for Black', () => {
    const [ruff, black] = [PYPROJECT, BLACK].map((pyproject) =>
      inContext({ 'pyproject.toml': pyproject }, {}, (context) => [
        lintFixCommand(context, ['-a.py']).slice(-2),
        formatStdinCommand(context, '-a.py').slice(-2),
      ]),
    );

    expect([ruff, black]).toEqual([
      [
        ['--', '-a.py'],
        ['--stdin-filename=-a.py', '-'],
      ],
      [
        ['--', '-a.py'],
        ['--stdin-filename=-a.py', '-'],
      ],
    ]);
  });
});

describe('blackForceExclude', () => {
  const context = { project: { formatter: 'black' }, conventions: {}, projectRoot: '/missing' };

  it('forces the default Black excludes when the options name none', () => {
    const forced = blackForceExclude(context, ['--line-length', '88']);

    expect(forced).toEqual(['--force-exclude', `(?:${BLACK_DEFAULT_EXCLUDES})`]);
    expect(new RegExp(forced[1]).test('/venv/lib/x.py')).toBe(true);
  });
  it('forces the excludes the options carry instead of the default ones, plus the extended ones', () => {
    const options = ['--exclude', 'a/', '--extend-exclude', '^/b/', '--force-exclude', 'c'];

    expect(blackForceExclude(context, options)).toEqual([
      '--force-exclude',
      '(?:a/)|(?:^/b/)|(?:c)',
    ]);
  });
  it('adds the exclude settings of the project config once the project opted in', () => {
    const patterns = inContext(
      {
        'pyproject.toml': `${PYPROJECT}[tool.black]\nexclude = "migrations"\nextend-exclude = "gen"\nforce-exclude = "vendor"\n`,
      },
      { headPolicy: { tools: { black: { precedence: ['project'] } } } },
      (inner) => blackForceExclude(inner, ['--exclude', 'x']),
    );

    expect(patterns).toEqual(['--force-exclude', '(?:x)|(?:migrations)|(?:gen)|(?:vendor)']);
  });
});
