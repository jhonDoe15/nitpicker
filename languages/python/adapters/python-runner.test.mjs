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

function enforceable(findings) {
  return findings.filter(({ classification }) => classification !== 'descriptive');
}

describe('analyzing a Python snapshot', () => {
  it('turns the ruff, format and coverage reports into findings', () => {
    const root = project({
      'violations.txt': 'F401|src/demo/a.py|`os` imported but unused\nB006|src/demo/a.py|mutable\n',
      'unformatted.txt': 'src/demo/a.py\n',
      'coverage-data.json': coverageReport,
    });

    const { findings } = analyze(root);

    expect(
      findings
        .filter(({ tool }) => tool !== 'coupling')
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
    ).toEqual([
      'ruff F401 src/demo/a.py',
      'ruff B006 src/demo/a.py',
      'ruff-format format src/demo/a.py',
      'coverage line-coverage src/demo/a.py',
      'coverage uncovered-function src/demo/a.py',
    ]);
    expect(findings[0]).toEqual({
      tool: 'ruff',
      rule: 'F401',
      path: 'src/demo/a.py',
      identity: 'fp:nitpicker/subject=`os` imported but unused',
      message: '`os` imported but unused',
      classification: 'enforceable',
      location: { line: 1, column: 1 },
    });
  });

  it('says how to lift the rules that flag idiomatic code and when the formatter was guessed', () => {
    const root = project({
      'violations.txt': 'T201|src/demo/a.py|`print` found\nB006|src/demo/a.py|mutable\n',
      'unformatted.txt': 'src/demo/a.py\n',
    });

    const messages = enforceable(analyze(root).findings).map(
      ({ rule, message }) => `${rule}: ${message}`,
    );

    expect(messages).toEqual([
      'T201: `print` found Not wanted here? Add the path to "exclude" in nitpicker.config.json.',
      'B006: mutable',
      'format: File is not formatted with ruff (detected; set "python.formatter" if wrong)',
    ]);
    expect(
      enforceable(analyze(root, { settings: { formatter: 'ruff' } }).findings).at(-1).message,
    ).toBe('File is not formatted with ruff');
  });

  it('reports a run without tests as an enforceable finding, so only a change that removes them fails', () => {
    const root = project({ 'test-exit.txt': '5\n' });

    expect(enforceable(analyze(root).findings)).toEqual([
      {
        tool: 'python',
        rule: 'no-tests-ran',
        path: '.',
        identity: 'no-tests-ran',
        message: 'No tests ran. Keep the project tests, or restore the ones this change removed.',
        classification: 'enforceable',
      },
    ]);
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

    expect(findings.filter(({ classification }) => classification !== 'descriptive')).toEqual([
      {
        tool: 'python',
        rule: 'baseline-expansion',
        path: 'src/demo/a.py',
        identity: expect.any(String),
        message: 'Legacy allowance increased from 1 to 2 for F401',
        classification: 'enforceable',
      },
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
      {
        tool: 'python',
        rule: 'format-failed',
        path: '.',
        identity: 'format-failed',
        message: 'ruff format exited 2 in the virtualenv environment:\nruff crashed',
        classification: 'tool-error',
      },
      {
        tool: 'python',
        rule: 'tests-failed',
        path: '.',
        identity: 'tests-failed',
        message: 'coverage run exited 1 in the virtualenv environment:\n1 failed: test_greet',
        classification: 'tool-error',
      },
    ]);
  });

  it('maps a broken environment to one tool-error finding', () => {
    const root = project();

    const { findings } = analyze(root, { settings: { environment: 'nowhere' } });

    expect(findings).toEqual([
      {
        tool: 'python',
        rule: 'environment-failed',
        path: '.',
        identity: 'environment-failed',
        message: `No Python environment at ${path.join(root, 'nowhere')} (${path.join(root, 'nowhere/bin')} does not exist): create it, or set "python.environment"`,
        classification: 'tool-error',
      },
    ]);
  });

  it('maps an unreadable report to a tool-error finding instead of throwing', () => {
    const root = project({ 'coverage-data.json': 'not json' });

    const { findings } = analyze(root);

    expect(findings).toEqual([
      {
        tool: 'python',
        rule: 'python-failed',
        path: '.',
        identity: 'python-failed',
        message: expect.any(String),
        classification: 'tool-error',
      },
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
    expect(parsePythonArguments(['--project-root', '/p'])).toEqual({
      projectRoot: '/p',
      liveRoot: '/p',
      settings: {},
      policy: { exclude: [], exceptions: [], snapshot: 'head' },
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

    expect(parsed).toEqual({
      projectRoot: '/snapshot',
      liveRoot: '/live',
      settings: { formatter: 'black' },
      policy: { exclude: ['gen/**'], exceptions: [], snapshot: 'base' },
    });
  });

  it('rejects unknown options', () => {
    expect(() => parsePythonArguments(['--project-root', '/p', '--nope', 'x'])).toThrow('Usage');
  });
});
