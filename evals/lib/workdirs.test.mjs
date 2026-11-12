import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCase } from '../runner/run-case.mjs';
import {
  PYTHON_CONSTRAINTS,
  copiedWorkdir,
  linkedTree,
  pipArguments,
  provisionEnvironment,
} from './workdirs.mjs';

const cases = path.join(import.meta.dirname, 'test-support', 'cases');
let directory;
beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-workdirs-'));
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const prepared = (name) => {
  const workdir = path.join(directory, name);
  mkdirSync(workdir);
  copiedWorkdir()({ caseDefinition: loadCase(path.join(cases, name)), workdir });
  return (file) => readFileSync(path.join(workdir, file), 'utf8');
};

describe('copiedWorkdir', () => {
  it('names the preset in a fixture that has no gate configuration', () => {
    expect(JSON.parse(prepared('python-sample')('nitpicker.config.json'))).toEqual({
      preset: 'python',
    });
    expect(JSON.parse(prepared('kotlin-sample')('nitpicker.config.json'))).toEqual({
      preset: 'kotlin',
    });
  });

  it('copies the fixture files of a Gradle and a Maven project', () => {
    expect(prepared('java-sample')('build.gradle')).toContain('plugins');
    expect(prepared('maven-sample')('pom.xml')).toContain('<project');
  });
});

describe('linkedTree', () => {
  it('adds the preset gitignore and a plain manifest to a Python or JVM fixture', () => {
    const files = linkedTree(loadCase(path.join(cases, 'python-sample')));
    expect(files.get('.gitignore')).toContain('.coverage');
    expect(JSON.parse(files.get('package.json'))).toMatchObject({ private: true });
    expect(JSON.parse(files.get('nitpicker.config.json'))).toEqual({ preset: 'python' });
  });

  it('gives a Gradle fixture the Gradle ignores and no script manifest', () => {
    const files = linkedTree(loadCase(path.join(cases, 'java-sample')));
    expect(files.get('.gitignore')).toContain('.gradle/');
    expect(files.get('package.json')).not.toContain('vitest');
  });
});

describe('pipArguments', () => {
  it('holds the tools to the versions of the Python e2e suites', () => {
    expect(existsSync(PYTHON_CONSTRAINTS)).toBe(true);
    const args = pipArguments({ caseDefinition: {}, pyproject: path.join(directory, 'none.toml') });
    expect(args).toEqual(expect.arrayContaining(['--constraint', PYTHON_CONSTRAINTS]));
  });

  const caseDefinition = { dependencies: { requests: '>=2' } };
  const pyproject = (text) => {
    const file = path.join(directory, `pyproject-${String(text.length)}.toml`);
    writeFileSync(file, text);
    return file;
  };

  it('installs the project editable and its dev group when it declares them', () => {
    const text = '[build-system]\nrequires = []\n\n[dependency-groups]\ndev = ["ruff"]\n';
    const args = pipArguments({ caseDefinition, pyproject: pyproject(text) });
    expect(args.slice(0, 5)).toEqual(['pip', 'install', '-q', '--python', '.venv']);
    expect(args).toEqual(
      expect.arrayContaining(['-e', '.', '--group', 'dev', 'pytest', 'mutmut', 'requests>=2']),
    );
  });

  it('installs only the tools and the listed packages otherwise', () => {
    const args = pipArguments({ caseDefinition, pyproject: path.join(directory, 'absent.toml') });
    expect(args).not.toContain('-e');
    expect(args).not.toContain('--group');
    expect(args.at(-1)).toBe('requests>=2');
  });
});

describe('provisionEnvironment', () => {
  it('does nothing for presets whose tools come from the PATH', () => {
    const caseDefinition = loadCase(path.join(cases, 'java-sample'));
    expect(provisionEnvironment({ caseDefinition, workdir: path.join(directory, 'none') })).toBe(
      undefined,
    );
  });
});
