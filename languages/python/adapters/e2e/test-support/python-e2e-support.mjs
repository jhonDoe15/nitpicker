import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
import { runCli } from '../../../../../core/cli.mjs';
import { fileURLToPath } from 'node:url';

const LOCAL_COMMAND_TIMEOUT_MS = 30_000;
const PROVISIONING_TIMEOUT_MS = 120_000;
const UV_PROVISIONING_COMMANDS = new Set(['lock', 'sync', 'pip']);

export const pythonE2eEnabled = process.env.NITPICKER_PYTHON_E2E === '1';

export const fixture = path.resolve(
  fileURLToPath(new URL('../../', import.meta.url)),
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

export function command(cwd, program, args) {
  const timeout =
    program === 'uv' && UV_PROVISIONING_COMMANDS.has(args[0])
      ? PROVISIONING_TIMEOUT_MS
      : LOCAL_COMMAND_TIMEOUT_MS;
  const result = spawnSync(program, args, {
    cwd,
    encoding: 'utf8',
    env: gitEnvironment,
    timeout,
  });
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

export function commitBranchFrom({ root, name, files, from }) {
  git(root, 'checkout', '-q', '-b', name, from);
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

export function commitBranch(root, name, files) {
  commitBranchFrom({ root, name, files, from: 'main' });
}

export function gate(root, branch, { extra = [], environment = {}, base = 'main' } = {}) {
  git(root, 'checkout', '-q', branch);
  const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-out-'));
  const output = { text: '' };
  const exitCode = runCli({
    arguments_: ['--base', base, '--output', reports, ...extra],
    environment: { NO_COLOR: '1', ...environment },
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
  function json(name) {
    const file = path.resolve(reports, name);
    if (!file.startsWith(reports + path.sep)) {
      throw new Error(`${name} is outside the reports directory`);
    }
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  return { exitCode, json, text: output.text, reports };
}

export function summarize(findings) {
  return findings
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`)
    .sort();
}

const roots = [];

export function repository() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-e2e-')));
  roots.push(root);
  return root;
}

export function removeRepositories() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function initializeRepository(root, message) {
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
}

export function installPackages(root, packages) {
  command(root, 'uv', ['venv', '-q', '.venv']);
  command(root, 'uv', ['pip', 'install', '-q', '--python', '.venv', ...packages]);
}

export function fixtureRepository(packages) {
  const root = repository();
  cpSync(fixture, root, { recursive: true });
  initializeRepository(root, 'base with one legacy violation');
  installPackages(root, ['-e', '.', ...packages]);
  return root;
}
