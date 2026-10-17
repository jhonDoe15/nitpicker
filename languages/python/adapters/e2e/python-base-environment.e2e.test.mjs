import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openSnapshotEnvironment } from '../execution/python-environment.mjs';
import { pythonE2eEnabled } from './test-support/python-e2e-support.mjs';

const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-base-env-e2e-')));
  roots.push(root);
  return root;
}

function write(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

function lock(root, program, args, lockFile) {
  const scratch = temporaryRoot();
  copyFileSync(path.join(root, 'pyproject.toml'), path.join(scratch, 'pyproject.toml'));
  const result = spawnSync(program, args, { cwd: scratch, encoding: 'utf8' });
  expect(`${program} ${args.join(' ')} -> ${String(result.status)} ${result.stderr}`).toBe(
    `${program} ${args.join(' ')} -> 0 ${result.stderr}`,
  );
  copyFileSync(path.join(scratch, lockFile), path.join(root, lockFile));
}

const DEPENDENCY = 'iniconfig==2.0.0';
const SETUP_MARKER = 'open("SETUP_EXECUTED", "w").close()\n';
const BUILD_SYSTEM =
  '[build-system]\nrequires = ["setuptools"]\nbuild-backend = "setuptools.build_meta"\n';

function pyproject(pythonRange, extra = '') {
  return `[project]\nname = "demo"\nversion = "0.1.0"\nrequires-python = "${pythonRange}"\ndependencies = ["${DEPENDENCY}"]\n${extra}`;
}

function environmentOf(projectRoot, liveRoot) {
  const launcher = openSnapshotEnvironment({ projectRoot, liveRoot });
  const launch = launcher.launch('python', [
    '-c',
    'import sys, importlib.util; print(sys.prefix); print(importlib.util.find_spec("iniconfig") is not None)',
  ]);
  const result = spawnSync(launch.command, launch.args, {
    encoding: 'utf8',
    env: { ...process.env, ...launch.env },
  });
  const [prefix, imports] = result.stdout.trim().split('\n');
  return { description: launcher.description, prefix, imports: imports === 'True' };
}

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!pythonE2eEnabled)('the base snapshot builds its own environment', () => {
  it('with uv from a changed uv.lock', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    write(base, { 'pyproject.toml': pyproject('>=3.10', BUILD_SYSTEM), 'setup.py': SETUP_MARKER });
    write(head, { 'pyproject.toml': pyproject('>=3.11', BUILD_SYSTEM) });
    lock(base, 'uv', ['lock'], 'uv.lock');
    lock(head, 'uv', ['lock'], 'uv.lock');

    expect(environmentOf(base, head)).toEqual({
      description: 'uv',
      prefix: path.join(base, '.venv'),
      imports: true,
    });
    expect(existsSync(path.join(base, 'SETUP_EXECUTED'))).toBe(false);
  });

  it('with poetry from a changed poetry.lock', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    const poetry = '[tool.poetry]\npackage-mode = false\n';
    write(base, { 'pyproject.toml': pyproject('>=3.10', poetry) });
    write(head, { 'pyproject.toml': pyproject('>=3.11', poetry) });
    lock(base, 'poetry', ['lock'], 'poetry.lock');
    lock(head, 'poetry', ['lock'], 'poetry.lock');

    expect(environmentOf(base, head)).toEqual({
      description: 'poetry',
      prefix: path.join(base, '.venv'),
      imports: true,
    });
  });

  it('with pip from a changed requirements file', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    write(base, {
      'requirements.txt': `${DEPENDENCY}\n-e .\n`,
      'setup.py': SETUP_MARKER,
    });
    write(head, { 'requirements.txt': '# head\n' });

    expect(environmentOf(base, head)).toEqual({
      description: 'pip',
      prefix: path.join(base, '.venv'),
      imports: true,
    });
    expect(existsSync(path.join(base, 'SETUP_EXECUTED'))).toBe(false);
  });
});
