import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectEnvironment, openEnvironment } from '../python-environment.mjs';
import { installFakeManager } from './test-support/fake-managers.mjs';

const roots = [];
const savedEnvironment = new Map();

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-managed-env-')));
  roots.push(root);
  return root;
}

function setEnvironment(name, value) {
  if (!savedEnvironment.has(name)) {
    savedEnvironment.set(name, process.env[name]);
  }
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}

function write(root, relative, text = '') {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), text);
}

function withManager(name, spec) {
  const tools = temporaryRoot();
  installFakeManager(path.join(tools, name), spec);
  setEnvironment('PATH', `${tools}${path.delimiter}/usr/bin${path.delimiter}/bin`);
}

function withoutManagers() {
  setEnvironment('PATH', temporaryRoot());
}

afterEach(() => {
  for (const [name, value] of savedEnvironment) {
    setEnvironment(name, value);
  }
  savedEnvironment.clear();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('detecting a pipenv, hatch or conda project', () => {
  it.each([
    ['Pipfile', 'pipenv'],
    ['Pipfile.lock', 'pipenv'],
    ['hatch.toml', 'hatch'],
    ['environment.yml', 'conda'],
    ['environment.yaml', 'conda'],
  ])('detects %s as %s', (file, kind) => {
    const root = temporaryRoot();
    write(root, file);

    expect(detectEnvironment(root)).toEqual({ kind, detected: true });
  });

  it('detects hatch from the environments table of pyproject.toml, not from the build backend', () => {
    const root = temporaryRoot();
    write(root, 'pyproject.toml', '[tool.hatch.build.targets.wheel]\npackages = ["src/a"]\n');
    expect(detectEnvironment(root)).toEqual({ kind: 'path' });

    write(root, 'pyproject.toml', '[tool.hatch.envs.default]\ndependencies = ["pytest"]\n');
    expect(detectEnvironment(root)).toEqual({ kind: 'hatch', detected: true });

    write(root, 'pyproject.toml', '[tool.hatch.envs.test.scripts]\nrun = "pytest"\n');
    expect(detectEnvironment(root)).toEqual({ kind: 'hatch', detected: true });
  });

  it('puts the lock files of uv and poetry before them and a .venv after them', () => {
    const root = temporaryRoot();
    write(root, 'Pipfile');
    write(root, '.venv/bin/python');
    expect(detectEnvironment(root)).toEqual({ kind: 'pipenv', detected: true });

    write(root, 'poetry.lock');
    expect(detectEnvironment(root)).toEqual({ kind: 'poetry' });
  });

  it.each(['pipenv', 'hatch', 'conda'])('lets the setting name %s', (name) => {
    expect(detectEnvironment(temporaryRoot(), name)).toEqual({ kind: name });
  });
});

describe('opening a pipenv environment', () => {
  it('uses the virtualenv pipenv reports', () => {
    const root = temporaryRoot();
    const venv = temporaryRoot();
    write(venv, 'bin/pytest');
    withManager('pipenv', { output: venv });

    const launcher = openEnvironment({ kind: 'pipenv', detected: true }, root);

    expect(launcher.description).toBe('pipenv');
    expect(launcher.launch('pytest', []).command).toBe(path.join(venv, 'bin/pytest'));
  });

  it('reports a Pipfile project without a virtualenv', () => {
    const root = temporaryRoot();
    withManager('pipenv', { status: 1, error: 'No virtualenv has been created' });

    expect(() => openEnvironment({ kind: 'pipenv', detected: true }, root)).toThrow(
      `pipenv has no virtualenv for ${root}: run \`pipenv install --dev\` first, or set "python.environment" (No virtualenv has been created)`,
    );
  });

  it('carries on with the PATH when pipenv is not installed and was only detected', () => {
    withoutManagers();

    expect(openEnvironment({ kind: 'pipenv', detected: true }, temporaryRoot()).description).toBe(
      'PATH',
    );
  });

  it('fails when pipenv is not installed and the setting asked for it', () => {
    const root = temporaryRoot();
    withoutManagers();

    expect(() => openEnvironment({ kind: 'pipenv' }, root)).toThrow(
      `No pipenv environment found for ${root}: install pipenv or activate the environment, or set "python.environment"`,
    );
  });
});

describe('opening a hatch environment', () => {
  it('uses the environment hatch finds', () => {
    const root = temporaryRoot();
    const venv = temporaryRoot();
    write(venv, 'bin/ruff');
    withManager('hatch', { output: venv });

    const launcher = openEnvironment({ kind: 'hatch', detected: true }, root);

    expect(launcher.description).toBe('hatch');
    expect(launcher.launch('ruff', []).command).toBe(path.join(venv, 'bin/ruff'));
  });

  it('asks to create an environment hatch has only named', () => {
    const root = temporaryRoot();
    const missing = path.join(root, 'nope');
    withManager('hatch', { output: missing });

    expect(() => openEnvironment({ kind: 'hatch', detected: true }, root)).toThrow(
      `hatch has not created its environment at ${missing}: run \`hatch env create\` first, or set "python.environment"`,
    );
  });

  it('carries on with the PATH when hatch is not installed and was only detected', () => {
    withoutManagers();

    expect(openEnvironment({ kind: 'hatch', detected: true }, temporaryRoot()).description).toBe(
      'PATH',
    );
  });
});

describe('opening a conda environment', () => {
  it('uses the prefix declared in environment.yml', () => {
    const root = temporaryRoot();
    const prefix = temporaryRoot();
    write(prefix, 'bin/pytest');
    write(root, 'environment.yml', `name: demo\nprefix: ${prefix}\ndependencies:\n  - pytest\n`);

    const launcher = openEnvironment({ kind: 'conda', detected: true }, root);

    expect(launcher.description).toBe('conda');
    expect(launcher.launch('pytest', ['-q'])).toEqual({
      command: path.join(prefix, 'bin/pytest'),
      args: ['-q'],
      env: { CONDA_PREFIX: prefix },
    });
    expect(launcher.launch('ruff', []).command).toBe('ruff');
    expect(launcher.launch('../outside', []).command).toBe('../outside');
  });

  it('finds an environment by name through conda', () => {
    const root = temporaryRoot();
    const prefix = path.join(temporaryRoot(), 'demo');
    write(prefix, 'bin/python');
    write(root, 'environment.yml', 'name: demo\n');
    withManager('conda', { output: JSON.stringify({ envs: ['/opt/conda', prefix] }) });

    expect(openEnvironment({ kind: 'conda', detected: true }, root).launch('python', [])).toEqual({
      command: path.join(prefix, 'bin/python'),
      args: [],
      env: { CONDA_PREFIX: prefix },
    });
  });

  it('asks to create the environment when conda does not list it', () => {
    const root = temporaryRoot();
    write(root, 'environment.yml', 'name: demo\n');
    withManager('conda', { output: '{"envs": ["/opt/conda"]}' });

    expect(() => openEnvironment({ kind: 'conda', detected: true }, root)).toThrow(
      'conda has no environment named demo: run `conda env create -f environment.yml` first, or set "python.environment"',
    );
  });

  it('carries on with the PATH when conda is not installed', () => {
    const root = temporaryRoot();
    write(root, 'environment.yml', 'name: demo\n');
    withoutManagers();

    expect(openEnvironment({ kind: 'conda', detected: true }, root).description).toBe('PATH');
  });

  it('reports a declared prefix that does not exist', () => {
    const root = temporaryRoot();
    const prefix = path.join(root, 'gone');
    write(root, 'environment.yml', `prefix: ${prefix}\n`);

    expect(() => openEnvironment({ kind: 'conda', detected: true }, root)).toThrow(
      `No conda environment at ${prefix}: create it with \`conda env create -f environment.yml\`, or set "python.environment"`,
    );
  });
});
