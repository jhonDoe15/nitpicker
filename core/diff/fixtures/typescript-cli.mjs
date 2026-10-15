import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { runCli } from '../../cli.mjs';

const temporaryRoots = [];
const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Nitpicker Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Nitpicker Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};

function temporaryRoot(prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: gitEnvironment });
}

export function writeFiles(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
}

export function commitAll(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

/** A git repository whose `comparison-base` branch holds `files`, with the package's tools linked in. */
export function typescriptRepository(files) {
  const root = temporaryRoot('nitpicker-typescript-cli-');
  git(root, ['init', '-q', '--initial-branch=main']);
  symlinkSync(
    path.join(import.meta.dirname, '../../../node_modules'),
    path.join(root, 'node_modules'),
    'dir',
  );
  writeFiles(root, {
    '.gitignore': 'node_modules/\n',
    'package.json': '{"name":"fixture","type":"module"}\n',
    ...files,
  });
  commitAll(root, 'base');
  git(root, ['branch', '-f', 'comparison-base']);
  return root;
}

/** Runs the gate on the `analyzers` of the repository against `comparison-base`. */
export function runTypescript(root, analyzers) {
  const reports = path.join(temporaryRoot('nitpicker-typescript-out-'), 'reports');
  const output = { out: '', err: '' };
  const exitCode = runCli({
    arguments_: [
      '--base',
      'comparison-base',
      '--output',
      reports,
      ...analyzers.flatMap((name) => ['--analyzer', name]),
    ],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: { write: (value) => (output.out += value) },
    stderr: { write: (value) => (output.err += value) },
    progress: { write: () => undefined },
  });
  const json = (name) => JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
  return { exitCode, json, text: output.out + output.err };
}

export function useTypescriptCli() {
  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
