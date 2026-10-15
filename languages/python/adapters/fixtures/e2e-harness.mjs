import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function command(cwd, program, args) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', env: gitEnvironment });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
}

export function git(root, ...args) {
  command(root, 'git', args);
}

export function write(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

export function commitBranch(root, name, files, from = 'main') {
  git(root, 'checkout', '-q', '-b', name, from);
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

export function createGate(runCli) {
  return function gate(root, branch, extra = [], base = 'main') {
    git(root, 'checkout', '-q', branch);
    const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-out-'));
    const output = { text: '' };
    const exitCode = runCli({
      arguments_: ['--base', base, '--output', reports, ...extra],
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
  };
}

export function createVirtualEnvironment(root) {
  command(root, 'uv', ['venv', '-q', '.venv']);
  command(root, 'uv', [
    'pip',
    'install',
    '-q',
    '--python',
    '.venv',
    '-e',
    '.',
    'coverage',
    'mutmut',
    'pytest',
    'mypy',
  ]);
}
