import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakePoetry } from './fixtures/fake-toolchain.mjs';
import { detectEnvironment, openEnvironment } from './python-environment.mjs';

const roots = [];
const savedEnvironment = new Map();

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-env-')));
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

function touch(root, relative) {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), '');
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

describe('environment detection', () => {
  it('prefers uv.lock, then poetry.lock, then .venv, then the PATH', () => {
    const root = temporaryRoot();
    expect(detectEnvironment(root)).toEqual({ kind: 'path' });

    touch(root, '.venv/bin/python');
    expect(detectEnvironment(root)).toEqual({ kind: 'venv', directory: path.join(root, '.venv') });

    touch(root, 'poetry.lock');
    expect(detectEnvironment(root)).toEqual({ kind: 'poetry' });

    touch(root, 'uv.lock');
    expect(detectEnvironment(root)).toEqual({ kind: 'uv' });
  });

  it.each(['uv', 'poetry', 'path'])('lets the setting name the %s environment', (name) => {
    const root = temporaryRoot();
    touch(root, 'uv.lock');

    expect(detectEnvironment(root, name)).toEqual({ kind: name });
  });

  it('treats any other setting as a virtual environment directory in the project', () => {
    const root = temporaryRoot();
    touch(root, 'uv.lock');

    expect(detectEnvironment(root, 'envs/ci')).toEqual({
      kind: 'venv',
      directory: path.join(root, 'envs/ci'),
    });
  });
});

describe('opening an environment', () => {
  it('launches tools from the virtual environment and puts it first on the PATH', () => {
    const root = temporaryRoot();
    touch(root, '.venv/bin/ruff');
    setEnvironment('PATH', '/usr/bin');

    const launcher = openEnvironment({ kind: 'venv', directory: path.join(root, '.venv') }, root);

    expect(launcher.description).toBe('virtualenv');
    expect(launcher.launch('ruff', ['check'])).toEqual({
      command: path.join(root, '.venv/bin/ruff'),
      args: ['check'],
      env: {
        VIRTUAL_ENV: path.join(root, '.venv'),
        PATH: `${path.join(root, '.venv/bin')}${path.delimiter}/usr/bin`,
      },
    });
    expect(launcher.launch('black', []).command).toBe('black');
  });

  it('reports a virtual environment that does not exist', () => {
    const root = temporaryRoot();

    expect(() =>
      openEnvironment({ kind: 'venv', directory: path.join(root, 'nope') }, root),
    ).toThrow(`No Python environment at ${path.join(root, 'nope')}`);
  });

  it('launches tools from the PATH, python as python3', () => {
    const launcher = openEnvironment({ kind: 'path' }, '/project');

    expect(launcher.description).toBe('PATH');
    expect(launcher.launch('ruff', ['--version'])).toEqual({
      command: 'ruff',
      args: ['--version'],
      env: {},
    });
    expect(launcher.launch('python', ['-c', 'x']).command).toBe(
      process.platform === 'win32' ? 'python' : 'python3',
    );
  });

  it('launches tools through uv run in the project without syncing it', () => {
    const root = temporaryRoot();
    touch(root, '.venv/pyvenv.cfg');
    setEnvironment('UV_PROJECT_ENVIRONMENT', undefined);

    const launcher = openEnvironment({ kind: 'uv' }, root);

    expect(launcher.description).toBe('uv');
    expect(launcher.launch('coverage', ['run', '-m', 'pytest'])).toEqual({
      command: 'uv',
      args: ['run', '--project', root, '--no-sync', '--', 'coverage', 'run', '-m', 'pytest'],
      env: {},
    });
  });

  it('finds the uv environment of an enclosing workspace', () => {
    const root = temporaryRoot();
    touch(root, '.venv/pyvenv.cfg');
    mkdirSync(path.join(root, 'members/app'), { recursive: true });
    setEnvironment('UV_PROJECT_ENVIRONMENT', undefined);

    expect(openEnvironment({ kind: 'uv' }, path.join(root, 'members/app')).description).toBe('uv');
  });

  it('honours UV_PROJECT_ENVIRONMENT', () => {
    const root = temporaryRoot();
    touch(root, 'elsewhere/pyvenv.cfg');
    setEnvironment('UV_PROJECT_ENVIRONMENT', 'elsewhere');

    expect(openEnvironment({ kind: 'uv' }, root).description).toBe('uv');

    setEnvironment('UV_PROJECT_ENVIRONMENT', 'missing');
    expect(() => openEnvironment({ kind: 'uv' }, root)).toThrow('uv has no environment');
  });

  it('asks the user to sync when uv has no environment', () => {
    const root = temporaryRoot();
    setEnvironment('UV_PROJECT_ENVIRONMENT', '');

    expect(() => openEnvironment({ kind: 'uv' }, path.join(root, 'app'))).toThrow('run `uv sync`');
  });

  it('uses the environment poetry reports', () => {
    const root = temporaryRoot();
    touch(root, 'venv/bin/pytest');
    const tools = temporaryRoot();
    installFakePoetry(tools, path.join(root, 'venv'));
    setEnvironment('PATH', `${tools}${path.delimiter}${process.env.PATH}`);

    const launcher = openEnvironment({ kind: 'poetry' }, root);

    expect(launcher.description).toBe('poetry');
    expect(launcher.launch('pytest', []).command).toBe(path.join(root, 'venv/bin/pytest'));
  });

  it('reports a poetry project without an environment', () => {
    const root = temporaryRoot();
    const tools = temporaryRoot();
    installFakePoetry(tools, '');
    setEnvironment('PATH', tools);

    expect(() => openEnvironment({ kind: 'poetry' }, root)).toThrow(
      `poetry has no environment for ${root}: run \`poetry install\` first`,
    );
  });

  it('reports a missing poetry binary', () => {
    const root = temporaryRoot();
    setEnvironment('PATH', temporaryRoot());

    expect(() => openEnvironment({ kind: 'poetry' }, root)).toThrow(
      /poetry could not run for .*ENOENT/,
    );
  });
});
