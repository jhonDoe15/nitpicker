import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pinAddopts,
  pinnedEnvironmentAddopts,
  pinnedPytestArguments,
  readPytestAddopts,
  shellWords,
} from './pytest-pins.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pytest-pins-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) writeFileSync(path.join(root, file), text);
  return root;
}

describe('pinning the pytest options that let a failing run pass', () => {
  it('drops stopping flags, test filters, reruns and disabled result plugins', () => {
    expect(
      pinAddopts([
        '-ra',
        '-vx',
        '--maxfail=2',
        '-k',
        'not slow',
        '--deselect',
        'tests/test_a.py::test_b',
        '--reruns',
        '3',
        '-p',
        'no:junitxml',
        '-p',
        'no:cacheprovider',
        '--strict-markers',
        '--sw',
        '-kfast',
      ]),
    ).toEqual({
      kept: ['-ra', '-v', '-p', 'no:cacheprovider', '--strict-markers'],
      removed: [
        '-vx',
        '--maxfail=2',
        '-k not slow',
        '--deselect tests/test_a.py::test_b',
        '--reruns 3',
        '-p no:junitxml',
        '--sw',
        '-kfast',
      ],
    });
  });
  it('keeps an -x that is the value of another short flag', () => {
    expect(pinAddopts(['-vWx']).kept).toEqual(['-vWx']);
  });
  it('splits addopts like a shell', () => {
    expect(shellWords(`-k "a and b" -o 'x=1 2' a\\ b`)).toEqual([
      '-k',
      'a and b',
      '-o',
      'x=1 2',
      'a b',
    ]);
  });
  it('reads addopts from the first pytest configuration file, in pytest order', () => {
    const root = project({
      'pytest.ini': '[pytest]\naddopts = -x -q\n',
      'pyproject.toml': '[tool.pytest.ini_options]\naddopts = ["--maxfail=1"]\n',
    });

    expect(readPytestAddopts(root)).toEqual({ file: 'pytest.ini', words: ['-x', '-q'] });
    expect(
      readPytestAddopts(
        project({ 'pyproject.toml': '[tool.pytest.ini_options]\naddopts = ["--maxfail=1"]\n' }),
      ),
    ).toEqual({ file: 'pyproject.toml', words: ['--maxfail=1'] });
    expect(
      readPytestAddopts(project({ 'setup.cfg': '[tool:pytest]\naddopts = -k smoke\n' })).words,
    ).toEqual(['-k', 'smoke']);
  });
  it('overrides addopts only when something is pinned, and turns reruns off when the plugin is installed', () => {
    expect(pinnedPytestArguments(project({ 'pytest.ini': '[pytest]\naddopts = -q -x\n' }))).toEqual(
      ['-o', 'addopts=-q'],
    );
    expect(pinnedPytestArguments(project({ 'pytest.ini': '[pytest]\naddopts = -q\n' }))).toEqual(
      [],
    );
    expect(pinnedPytestArguments(project({}), { rerunfailures: true })).toEqual(['-o', 'reruns=0']);
  });
  it('filters PYTEST_ADDOPTS the same way', () => {
    expect(pinnedEnvironmentAddopts('-x --tb=short -k "a b"')).toEqual({
      PYTEST_ADDOPTS: '--tb=short',
    });
    expect(pinnedEnvironmentAddopts('--tb=short')).toEqual({});
    expect(pinnedEnvironmentAddopts(undefined)).toEqual({});
  });
});
