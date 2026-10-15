import path from 'node:path';

import { spawnSync } from 'node:child_process';

import {
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  cpSync,
  rmSync,
} from 'node:fs';

import { tmpdir } from 'node:os';

import { runCli } from '../../../../core/cli.mjs';

import { describe, beforeAll, afterAll, it, expect } from 'vitest';

import {
  LAYERED_FILES,
  ORDER_TOTAL,
  SIGNS,
  signsTest,
  SIGN_POSITIVE,
  SIGN_NEGATIVE,
  BRANCH_CLAMP,
  CLAMP_LOW,
  PRAGMAS,
  CLAMP_HIGH,
} from '../fixtures/python-preset-data.mjs';

// End-to-end test of the Python preset on a small project with real tools. It needs python3, uv,
// ruff, pyright and network access to PyPI (it installs pytest, coverage and mypy into throwaway
// environments), so it only runs with NITPICKER_PYTHON_E2E=1 (`npm run test:python`).

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';

export const fixture = path.resolve(
  new URL('../', import.meta.url).pathname,
  'fixtures/python-project',
);

const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function command(cwd, program, args) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', env: gitEnvironment });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
}

function git(root, ...args) {
  command(root, 'git', args);
}

function write(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

function commitBranch(root, name, files) {
  git(root, 'checkout', '-q', '-b', name, 'main');
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

function gate(root, branch, extra = []) {
  git(root, 'checkout', '-q', branch);
  const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-out-'));
  const output = { text: '' };
  const exitCode = runCli({
    arguments_: ['--base', 'main', '--output', reports, ...extra],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: {
      write: (value) => {
        output.text += value;
      },
    },
    stderr: {
      write: (value) => {
        output.text += value;
      },
    },
    progress: { write: () => undefined },
  });
  const json = (name) => JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
  return { exitCode, json, text: output.text, reports };
}

const enforceable = (result) =>
  summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );

const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

const roots = [];

function repository() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-')));
  roots.push(root);
  return root;
}

describe.skipIf(!enabled)('Python duplicates, coupling and import contracts end to end', () => {
  let project;
  const enforceable = (result) =>
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable')
      .sort((left, right) =>
        `${left.tool}${left.identity}`.localeCompare(`${right.tool}${right.identity}`),
      );
  const newRules = (result) => enforceable(result).map(({ tool, rule }) => `${tool} ${rule}`);
  beforeAll(() => {
    project = repository();
    write(project, LAYERED_FILES);
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'layered base');
    command(project, 'uv', ['venv', '-q', '.venv']);
    command(project, 'uv', [
      'pip',
      'install',
      '-q',
      '--python',
      '.venv',
      'coverage',
      'pytest',
      'import-linter',
    ]);
    commitBranch(project, 'clean', {
      'src/shop/web/views.py': `${LAYERED_FILES['src/shop/web/views.py']}\n\ndef hide(amounts: list[float]) -> int:\n    return len(amounts)\n`,
    });
    commitBranch(project, 'copy', {
      'src/shop/domain/bulk.py': ORDER_TOTAL.replace('order_total', 'bulk_total'),
      'tests/test_bulk.py':
        'from shop.domain import bulk\n\n\ndef test_bulk_total():\n    assert bulk.bulk_total([(2, 3), (0, 1)], 5) == 1\n    assert bulk.bulk_total([(0, 1)], 5) == 0\n',
    });
    commitBranch(project, 'upward-import', {
      'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe() -> str:\n    from shop.web import views\n\n    return views.show([1])\n`,
    });
    commitBranch(project, 'contracts-off', {
      'src/shop/domain/pricing.py': `${LAYERED_FILES['src/shop/domain/pricing.py']}\n\ndef describe() -> str:\n    from shop.web import views\n\n    return views.show([1])\n`,
      'nitpicker.config.json':
        '{ "preset": "python", "disable": ["mutation"], "python": { "importLinter": false } }\n',
    });
  });
  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('fails a stable package importing an unstable one and the contract it breaks', () => {
    const result = gate(project, 'upward-import');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      enforceable(result).map(({ rule, path: file, identity }) => ({ rule, file, identity })),
    ).toEqual([
      {
        rule: 'stability-direction',
        file: 'src/shop/domain/__init__.py',
        identity: 'package-edge:shop.domain->shop.web',
      },
      {
        rule: 'contract-broken',
        file: 'src/shop/domain/pricing.py',
        identity: 'contract:Domain is pure:shop.domain.pricing -> shop.web.views',
      },
      {
        rule: 'contract-broken',
        file: 'src/shop/domain/pricing.py',
        identity:
          'contract:Domain is pure:shop.domain.pricing -> shop.web.views -> shop.infra.store',
      },
    ]);
  });
  it('does not run the contracts when the config turns import-linter off', () => {
    const result = gate(project, 'contracts-off');

    expect(newRules(result)).toEqual(['coupling stability-direction']);
    expect(result.json('summary.json').tools[0].version).not.toContain('import-linter');
  });
});
describe.skipIf(!enabled)('Python changed-branch coverage end to end', () => {
  let project;
  const branchFindings = (result) =>
    result
      .json('new-findings.json')
      .filter(({ rule }) => rule === 'changed-branch-coverage')
      .map(({ path: file, location }) => `${file}:${String(location.line)}`);
  beforeAll(() => {
    project = repository();
    cpSync(fixture, project, { recursive: true });
    write(project, {
      'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
      'src/demo/signs.py': SIGNS,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE),
    });
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'base with an untested branch in sign');
    command(project, 'uv', ['venv', '-q', '.venv']);
    command(project, 'uv', [
      'pip',
      'install',
      '-q',
      '--python',
      '.venv',
      '-e',
      '.',
      'coverage',
      'pytest',
    ]);
    commitBranch(project, 'shifted', { 'src/demo/signs.py': `"""Signs."""\n\n\n${SIGNS}` });
    commitBranch(project, 'edited', {
      'src/demo/signs.py': SIGNS.replace('x < 0', 'x <= -1'),
    });
    commitBranch(project, 'edited-and-tested', {
      'src/demo/signs.py': SIGNS.replace('x < 0', 'x <= -1'),
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, SIGN_NEGATIVE),
    });
    commitBranch(project, 'new-untested', {
      'src/demo/signs.py': `${SIGNS}\n\n${BRANCH_CLAMP}`,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, CLAMP_LOW),
    });
    commitBranch(project, 'pragmas', {
      'src/demo/pragmas.py': PRAGMAS,
      'tests/test_pragmas.py':
        'from demo import pragmas\n\n\ndef test_imported():\n    assert pragmas.hidden\n',
    });
    commitBranch(project, 'new-tested', {
      'src/demo/signs.py': `${SIGNS}\n\n${BRANCH_CLAMP}`,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, CLAMP_LOW, CLAMP_HIGH),
    });
  });
  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('keeps an old uncovered branch baselined when its line moves', () => {
    const result = gate(project, 'shifted');

    expect(result.exitCode, result.text).toBe(0);
    expect(branchFindings(result)).toEqual([]);
  });
  it('fails an uncovered branch whose line was edited', () => {
    const result = gate(project, 'edited');

    expect(result.exitCode, result.text).toBe(1);
    expect(branchFindings(result)).toEqual(['src/demo/signs.py:2']);
    expect(result.text).toMatch(
      /Branch coverage is 50\.00%; minimum is 95%\. Not taken: the branch to line 3/,
    );
  });
  it('passes an edited branch once a test takes both outcomes', () => {
    const result = gate(project, 'edited-and-tested');

    expect(result.exitCode, result.text).toBe(0);
  });
  it('fails a new branch no test takes, and leaves the old gap alone', () => {
    const result = gate(project, 'new-untested');

    expect(result.exitCode, result.text).toBe(1);
    expect(branchFindings(result)).toEqual(['src/demo/signs.py:8']);
  });
  it('honors no pragma, but leaves the main guard alone', () => {
    const result = gate(project, 'pragmas');

    expect(branchFindings(result)).toEqual(['src/demo/pragmas.py:5']);
  });
  it('passes a new branch whose outcomes are both tested', () => {
    const result = gate(project, 'new-tested');

    expect(result.exitCode, result.text).toBe(0);
  });
});
