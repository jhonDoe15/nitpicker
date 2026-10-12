import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeToolchain } from './fixtures/fake-toolchain.mjs';
import { analyzePythonSnapshot, parsePythonArguments } from './python-runner.mjs';

const roots = [];
let savedTemporaryDirectory;

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-runner-')));
  roots.push(root);
  return root;
}

afterEach(() => {
  if (savedTemporaryDirectory !== undefined) {
    process.env.TMPDIR = savedTemporaryDirectory.value;
    if (savedTemporaryDirectory.value === undefined) {
      delete process.env.TMPDIR;
    }
    savedTemporaryDirectory = undefined;
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files = {}) {
  const root = temporaryRoot();
  installFakeToolchain(path.join(root, '.venv/bin'));
  mkdirSync(path.join(root, 'src/demo'), { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

const coverageReport = JSON.stringify({
  files: {
    'src/demo/a.py': {
      summary: { num_statements: 4, covered_lines: 3 },
      functions: { never: { summary: { num_statements: 1, covered_lines: 0 } } },
    },
  },
});

const analyze = (root, extra = {}) =>
  analyzePythonSnapshot({ projectRoot: root, liveRoot: root, settings: {}, policy: {}, ...extra });

describe('analyzing a Python snapshot', () => {
  it('turns the ruff, format and coverage reports into findings', () => {
    const root = project({
      'violations.txt': 'F401|src/demo/a.py|`os` imported but unused\nB006|src/demo/a.py|mutable\n',
      'unformatted.txt': 'src/demo/a.py\n',
      'coverage-data.json': coverageReport,
    });

    const { findings } = analyze(root);

    expect(findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`)).toEqual([
      'ruff F401 src/demo/a.py',
      'ruff B006 src/demo/a.py',
      'ruff-format format src/demo/a.py',
      'coverage line-coverage src/demo/a.py',
      'coverage uncovered-function src/demo/a.py',
    ]);
    expect(findings[0]).toMatchObject({
      identity: 'fp:nitpicker/subject=`os` imported but unused',
      classification: 'enforceable',
      location: { line: 1, column: 1 },
    });
  });

  it('reads type errors and the one-way rules, each message naming the allowed form', () => {
    const root = project({
      'violations.txt': 'T201|src/demo/a.py|`print` found\n',
      'type-errors.txt':
        'src/demo/a.py:3: error: Incompatible return value type (got "int", expected "str")  [return-value]\nsrc/demo/a.py:3: note: ignored\n',
      'rules.json': JSON.stringify([
        { rule: 'frozen-dataclass', path: 'src/demo/a.py', subject: 'Order', line: 5 },
      ]),
    });

    const { findings } = analyze(root);

    expect(findings.map(({ tool, rule, identity }) => `${tool} ${rule} ${identity}`)).toEqual([
      'ruff T201 fp:nitpicker/subject=`print` found',
      'mypy return-value Incompatible return value type (got "int", expected "str")',
      'python-rules frozen-dataclass Order',
    ]);
    expect(findings.map(({ message }) => message)).toEqual([
      expect.stringContaining('Use `logging`'),
      expect.stringContaining('Fix the type'),
      expect.stringContaining('@dataclass(frozen=True)'),
    ]);
  });

  it('lifts a rule for the paths of a python exception and nothing else', () => {
    const root = project({
      'violations.txt': 'T201|scripts/run.py|`print` found\nT201|src/demo/a.py|`print` found\n',
    });
    const exceptions = [{ rule: 'T201', paths: ['scripts/**'], reason: 'command line scripts' }];

    const { findings } = analyze(root, { settings: { exceptions } });

    expect(findings.map(({ path: file }) => file)).toEqual(['src/demo/a.py']);
  });

  it('drops excluded paths and baselines legacy sites, naming python in an expansion', () => {
    const headRoot = project({
      'violations.txt': 'F401|src/demo/a.py|unused\nF401|gen/b.py|unused\n',
      'nitpicker.legacy.json': JSON.stringify({
        sites: [
          { file: 'src/demo/a.py', rule: 'F401', source: 'fp:nitpicker/subject=unused', count: 2 },
        ],
      }),
    });
    const baseRoot = project({
      'nitpicker.legacy.json': JSON.stringify({
        sites: [
          { file: 'src/demo/a.py', rule: 'F401', source: 'fp:nitpicker/subject=unused', count: 1 },
        ],
      }),
    });

    const { findings } = analyze(headRoot, {
      policy: {
        exclude: ['gen/**'],
        legacyInventory: 'nitpicker.legacy.json',
        policyRoot: headRoot,
        baselineRoot: baseRoot,
        snapshot: 'head',
      },
    });

    expect(findings).toEqual([
      expect.objectContaining({
        tool: 'python',
        rule: 'baseline-expansion',
        message: 'Legacy allowance increased from 1 to 2 for F401',
      }),
    ]);
  });

  it('maps tool failures to tool-error findings and nothing else', () => {
    const root = project({
      'violations.txt': 'F401|src/demo/a.py|unused\n',
      'fail.json': JSON.stringify({ ruff: 'ruff crashed' }),
      'test-exit.txt': '1\n',
    });

    const { findings } = analyze(root);

    expect(findings).toEqual([
      {
        tool: 'python',
        rule: 'ruff-failed',
        path: '.',
        identity: 'ruff-failed',
        message: 'ruff check exited 2 in the virtualenv environment:\nruff crashed',
        classification: 'tool-error',
      },
      expect.objectContaining({ rule: 'format-failed', identity: 'format-failed' }),
      expect.objectContaining({ rule: 'tests-failed', identity: 'tests-failed' }),
      expect.objectContaining({ rule: 'rules-failed', identity: 'rules-failed' }),
    ]);
  });

  it('maps a broken environment to one tool-error finding', () => {
    const root = project();

    const { findings } = analyze(root, { settings: { environment: 'nowhere' } });

    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'environment-failed',
        classification: 'tool-error',
        message: expect.stringContaining('No Python environment'),
      }),
    ]);
  });

  it('maps an unreadable report to a tool-error finding instead of throwing', () => {
    const root = project({ 'coverage-data.json': 'not json' });

    const { findings } = analyze(root);

    expect(findings).toEqual([
      expect.objectContaining({
        tool: 'python',
        rule: 'python-failed',
        classification: 'tool-error',
        message: expect.stringContaining('JSON'),
      }),
    ]);
  });

  it('removes its temporary report directory', () => {
    const scratch = temporaryRoot();
    const root = project();
    savedTemporaryDirectory = { value: process.env.TMPDIR };
    process.env.TMPDIR = scratch;

    analyze(root);
    analyze(root, { settings: { environment: 'nowhere' } });

    expect(readdirSync(scratch)).toEqual([]);
  });
});

describe('runner arguments', () => {
  it('defaults the live root to the project and the settings to none', () => {
    expect(parsePythonArguments(['--project-root', '/p'])).toMatchObject({
      projectRoot: '/p',
      liveRoot: '/p',
      settings: {},
    });
  });

  it('reads the live root and settings and hands the rest to the shared parser', () => {
    const parsed = parsePythonArguments([
      '--project-root',
      '/snapshot',
      '--live-root',
      '/live',
      '--python-settings',
      '{"formatter":"black"}',
      '--exclude',
      'gen/**',
      '--snapshot',
      'base',
    ]);

    expect(parsed).toMatchObject({
      projectRoot: '/snapshot',
      liveRoot: '/live',
      settings: { formatter: 'black' },
      policy: { exclude: ['gen/**'], snapshot: 'base' },
    });
  });

  it('rejects unknown options', () => {
    expect(() => parsePythonArguments(['--project-root', '/p', '--nope', 'x'])).toThrow('Usage');
  });
});
