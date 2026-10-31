import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../../../../../core/cli.mjs';
import { pathInside } from '../../../../../shared/filesystem.mjs';

const COMMAND_TIMEOUT_MS = 60_000;
const GIT_SETTINGS = [
  '-c',
  'user.name=test',
  '-c',
  'user.email=test@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
];

export function command(cwd, program, args) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  }
  return result.stdout;
}

function git(root, ...args) {
  command(root, 'git', [...GIT_SETTINGS, ...args]);
}

function write(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = pathInside(root, file);
    if (target === undefined) {
      throw new Error(`${file} is outside ${root}`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

export function createWorkspace() {
  return realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-go-e2e-')));
}

export function removeWorkspace(workspace) {
  rmSync(workspace, { recursive: true, force: true });
}

export function temporaryDirectory(workspace, prefix) {
  return mkdtempSync(path.join(workspace, prefix));
}

export function goRepository(workspace, files) {
  const root = temporaryDirectory(workspace, 'repository-');
  write(root, files);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

export function commitBranch(root, name, files) {
  git(root, 'checkout', '-q', '-b', name, 'main');
  write(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
}

export function gate(root, branch) {
  git(root, 'checkout', '-q', branch);
  const reports = mkdtempSync(`${root}-reports-`);
  const output = { text: '' };
  const sink = {
    write(value) {
      output.text += value;
    },
  };
  const exitCode = runCli({
    arguments_: ['--base', 'main', '--output', reports],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: sink,
    stderr: sink,
    progress: { write: () => undefined },
  });
  function json(name) {
    const file = pathInside(reports, name);
    if (file === undefined) {
      throw new Error(`${name} is outside ${reports}`);
    }
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  return { exitCode, json, text: output.text };
}

function summary({ tool, rule, path: file }) {
  return `${tool}/${rule} ${file}`;
}

export function newFindings(result) {
  return result
    .json('new-findings.json')
    .filter((finding) => finding.classification === 'enforceable')
    .map(summary)
    .sort();
}

export function newMessages(result) {
  return result
    .json('new-findings.json')
    .filter((finding) => finding.classification === 'enforceable')
    .map(({ message }) => message);
}

export function toolErrors(result) {
  return result.json('tool-errors.json').map(summary).sort();
}

export function toolErrorMessages(result) {
  return result.json('tool-errors.json').map(({ message }) => message);
}
