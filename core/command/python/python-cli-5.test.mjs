import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installFakeToolchain } from '../../../languages/python/adapters/fixtures/fake-toolchain.mjs';
import { runCli } from '../../cli.mjs';

const temporaryRoots = [];

const savedEnvironment = {};

function temporaryRoot(prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const [name, { value }] of Object.entries(savedEnvironment)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, name);
    } else {
      process.env[name] = value;
    }
    Reflect.deleteProperty(savedEnvironment, name);
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const gitEnvironment = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: gitEnvironment });
}

function write(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

const LEGACY_VIOLATION = 'F401|src/demo/a.py|`os` imported but unused\n';

let templateRoot;

beforeAll(() => {
  templateRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-template-')));
  git(templateRoot, ['init', '-q', '--initial-branch=main']);
  git(templateRoot, ['config', 'user.name', 'Nitpicker Python Fixture']);
  git(templateRoot, ['config', 'user.email', 'nitpicker-python@example.invalid']);
  write(templateRoot, {
    'nitpicker.config.json': '{ "preset": "python" }\n',
    '.gitignore': '.venv/\n',
    'pyproject.toml': '[project]\nname = "demo"\nversion = "0.1.0"\n',
    'src/demo/a.py': 'import os\n\n\ndef value():\n    return 1\n',
    'violations.txt': LEGACY_VIOLATION,
  });
  installFakeToolchain(path.join(templateRoot, '.venv/bin'));
  commit(templateRoot, 'base');
  git(templateRoot, ['branch', 'comparison-base']);
});

afterAll(() => {
  rmSync(templateRoot, { recursive: true, force: true });
});

function pythonRepository(files = {}) {
  const root = temporaryRoot('nitpicker-python-cli-');
  cpSync(templateRoot, root, { recursive: true });
  if (Object.keys(files).length > 0) {
    write(root, files);
    commit(root, 'base');
    git(root, ['branch', '-f', 'comparison-base']);
  }
  return root;
}

function run(root, extra = []) {
  const output = { out: '', err: '' };
  const reports = path.join(temporaryRoot('nitpicker-python-out-'), 'reports');
  const exitCode = runCli({
    arguments_: ['--base', 'comparison-base', '--output', reports, ...extra],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: {
      write: (value) => {
        output.out += value;
      },
    },
    stderr: {
      write: (value) => {
        output.err += value;
      },
    },
    progress: { write: () => undefined },
  });
  const json = (name) => JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
  return { exitCode, reports, json, output, text: output.out + output.err };
}

describe('changed-branch-coverage with "preset": "python"', () => {
  const BRANCHY = [
    'import os',
    '',
    '',
    'def value(x):',
    '    if x:',
    '        return 1',
    '    return 2',
    '',
  ].join('\n');
  const coverageData = (executed, missing) =>
    JSON.stringify({
      files: { 'src/demo/a.py': { executed_branches: executed, missing_branches: missing } },
    });
  const GAP = coverageData([[5, 6]], [[5, 7]]);
  const branchyRepository = () =>
    pythonRepository({ 'src/demo/a.py': BRANCHY, 'coverage-data.json': GAP });
  const newBranchFindings = (result) =>
    result.json('new-findings.json').map(({ tool, rule, path: file, message, location }) => ({
      tool,
      rule,
      path: file,
      line: location?.line,
      message,
    }));
  it('fails a new branch that no test takes and passes once a test covers it', () => {
    const root = branchyRepository();
    write(root, {
      'src/demo/a.py': `${BRANCHY}\n\ndef sign(y):\n    if y < 0:\n        return -1\n    return 1\n`,
      'coverage-data.json': coverageData(
        [[5, 6]],
        [
          [5, 7],
          [11, 12],
          [11, 13],
        ],
      ),
    });
    commit(root, 'add an untested branch');

    const failing = run(root);

    expect(failing.exitCode, failing.text).toBe(1);
    expect(newBranchFindings(failing).map(({ line }) => line)).toEqual([11]);

    write(root, {
      'coverage-data.json': coverageData(
        [
          [5, 6],
          [11, 12],
          [11, 13],
        ],
        [[5, 7]],
      ),
    });
    commit(root, 'test it');

    expect(run(root).exitCode).toBe(0);
  });
});
