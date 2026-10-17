import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openSnapshotEnvironment } from '../../python-environment.mjs';
import { baseEnvironment } from './base-environment.mjs';
import {
  installRecordingManager,
  installRecordingPython,
} from './test-support/recording-managers.mjs';
import {
  pyproject,
  removeTemporaryRoots,
  temporaryRoot,
  write,
  writeAll,
} from './test-support/temporary-projects.mjs';

let savedPath;

function virtualenv(directory, description) {
  return { directory, description };
}

function withTools(install) {
  const tools = temporaryRoot();
  const log = path.join(temporaryRoot(), 'calls.log');
  savedPath ??= process.env.PATH;
  install(tools, log);
  process.env.PATH = `${tools}${path.delimiter}/usr/bin${path.delimiter}/bin`;
  return log;
}

function calls(log) {
  return readFileSync(log, 'utf8');
}

afterEach(() => {
  if (savedPath !== undefined) {
    process.env.PATH = savedPath;
    savedPath = undefined;
  }
  removeTemporaryRoots();
});

describe('building the base its own environment with the project tool', () => {
  const LOCKED = [
    [
      'uv',
      'uv.lock',
      'uv sync --frozen --no-install-project --no-install-workspace',
      'UV_PROJECT_ENVIRONMENT=%V',
    ],
    [
      'poetry',
      'poetry.lock',
      'poetry install --no-root --no-interaction',
      'POETRY_VIRTUALENVS_IN_PROJECT=true',
    ],
    ['pdm', 'pdm.lock', 'pdm sync --no-self', 'PDM_CHECK_UPDATE=false\nPDM_VENV_IN_PROJECT=true'],
    [
      'pipenv',
      'Pipfile.lock',
      'pipenv sync --dev',
      'PIPENV_IGNORE_VIRTUALENVS=1\nPIPENV_VENV_IN_PROJECT=1',
    ],
  ];

  it.each(LOCKED)(
    'runs %s in the base snapshot when its lock file differs',
    (kind, lock, command, variables) => {
      const base = temporaryRoot();
      const head = temporaryRoot();
      write(base, lock, 'new');
      write(head, lock, 'old');
      const log = withTools((tools, file) => installRecordingManager(tools, kind, { log: file }));

      const launcher = baseEnvironment({ projectRoot: base, liveRoot: head, virtualenv });

      expect(calls(log)).toBe(
        `${kind} ${command.slice(kind.length + 1)}\ncwd=${base}\n${variables.replace('%V', path.join(base, '.venv'))}\n`,
      );
      expect(launcher).toEqual({ directory: path.join(base, '.venv'), description: kind });
    },
  );

  it('does nothing when base and head have the same dependency files', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    writeAll(base, { 'uv.lock': 'same' });
    writeAll(head, { 'uv.lock': 'same' });
    const log = withTools((tools, file) => installRecordingManager(tools, 'uv', { log: file }));

    expect(baseEnvironment({ projectRoot: base, liveRoot: head, virtualenv })).toBeUndefined();
    expect(() => readFileSync(log, 'utf8')).toThrow(/ENOENT/);
  });

  it('does nothing for the head itself', () => {
    const head = temporaryRoot();
    write(head, 'uv.lock', 'a');

    expect(baseEnvironment({ projectRoot: head, liveRoot: head, virtualenv })).toBeUndefined();
  });

  it.each([['path'], ['hatch'], ['conda'], ['.venv'], ['/opt/env']])(
    'keeps the head environment when python.environment is %s',
    (setting) => {
      const base = temporaryRoot();
      const head = temporaryRoot();
      write(base, 'uv.lock', 'new');
      write(head, 'uv.lock', 'old');
      const log = withTools((tools, file) => installRecordingManager(tools, 'uv', { log: file }));

      expect(
        baseEnvironment({ projectRoot: base, liveRoot: head, setting, virtualenv }),
      ).toBeUndefined();
      expect(() => readFileSync(log, 'utf8')).toThrow(/ENOENT/);
    },
  );

  it('uses the tool python.environment names, even when another lock file comes first', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    writeAll(base, { 'uv.lock': 'a', 'poetry.lock': 'new' });
    writeAll(head, { 'uv.lock': 'a', 'poetry.lock': 'old' });
    const log = withTools((tools, file) => installRecordingManager(tools, 'poetry', { log: file }));

    const launcher = baseEnvironment({
      projectRoot: base,
      liveRoot: head,
      setting: 'poetry',
      virtualenv,
    });

    expect(calls(log).split('\n')[0]).toBe('poetry install --no-root --no-interaction');
    expect(launcher.description).toBe('poetry');
  });

  it('keeps the head environment when the base has no lock file of the named tool', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    write(base, 'pyproject.toml', pyproject('a==2'));
    write(head, 'pyproject.toml', pyproject('a==1'));

    expect(
      baseEnvironment({ projectRoot: base, liveRoot: head, setting: 'uv', virtualenv }),
    ).toBeUndefined();
  });

  it('refuses a Pipfile.lock that installs local packages', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    write(base, 'Pipfile.lock', '{"default": {"mine": {"editable": true, "path": "."}}}');
    write(head, 'Pipfile.lock', '{}');

    expect(() => baseEnvironment({ projectRoot: base, liveRoot: head, virtualenv })).toThrow(
      'Pipfile.lock of the base installs local packages, whose setup code the base environment must not run: install them in an environment of your own and set "python.environment" to it',
    );
  });

  it('creates an empty virtualenv when the tool installed nothing and made none', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    write(base, 'poetry.lock', 'new');
    write(head, 'poetry.lock', 'old');
    const log = withTools((tools, file) => {
      installRecordingManager(tools, 'poetry', { log: file, createsEnvironment: false });
      installRecordingPython(tools, { log: file });
    });

    baseEnvironment({ projectRoot: base, liveRoot: head, virtualenv });

    expect(calls(log)).toBe(
      `poetry install --no-root --no-interaction\ncwd=${base}\nPOETRY_VIRTUALENVS_IN_PROJECT=true\npython3 -m venv ${path.join(base, '.venv')}\n`,
    );
  });

  it('names the command and the install hint when the tool is missing', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    write(base, 'uv.lock', 'new');
    write(head, 'uv.lock', 'old');
    withTools(() => {});
    process.env.PATH = temporaryRoot();

    expect(() => baseEnvironment({ projectRoot: base, liveRoot: head, virtualenv })).toThrow(
      'uv is not installed, the base snapshot has other dependencies than the head, so it needs an environment of its own: install uv with `curl -LsSf https://astral.sh/uv/install.sh | sh` or `pip install uv`',
    );
  });

  it('reports the output of a failing install', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    write(base, 'poetry.lock', 'new');
    write(head, 'poetry.lock', 'old');
    withTools((tools, file) =>
      installRecordingManager(tools, 'poetry', { log: file, status: 1, stderr: 'lock is stale' }),
    );

    expect(() => baseEnvironment({ projectRoot: base, liveRoot: head, virtualenv })).toThrow(
      `poetry install --no-root --no-interaction failed for the base snapshot ${base} (exit 1): lock is stale. The base needs its own environment because its dependency files differ from the head's (install poetry with \`pipx install poetry\` or \`pip install poetry\`)`,
    );
  });
});

describe('building the base environment from requirements files', () => {
  it('creates a virtualenv and installs the safe requirements into it', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    writeAll(base, {
      'requirements.txt': 'flask==3.0.0\n-e .\n-c constraints.txt\n',
      'constraints.txt': 'flask<4\n',
    });
    writeAll(head, { 'requirements.txt': 'flask==2.0.0\n' });
    const log = withTools((tools, file) => installRecordingPython(tools, { log: file }));

    const launcher = baseEnvironment({ projectRoot: base, liveRoot: head, virtualenv });

    const directory = path.join(base, '.venv');
    const [venvCall, installCall] = calls(log).trim().split('\n');
    expect(venvCall).toBe(`python3 -m venv ${directory}`);
    expect(installCall.replace(/ -r \S+requirements\.txt /, ' -r <requirements> ')).toBe(
      `venv-python -m pip install --disable-pip-version-check --no-input --prefer-binary -r <requirements> -c ${path.join(base, 'constraints.txt')}`,
    );
    expect(launcher).toEqual({ directory, description: 'pip' });
  });

  it('leaves the head environment for a project that declares its own manager', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    writeAll(base, { 'requirements.txt': 'a==2', 'environment.yml': 'name: demo\n' });
    writeAll(head, { 'requirements.txt': 'a==1', 'environment.yml': 'name: demo\n' });

    expect(baseEnvironment({ projectRoot: base, liveRoot: head, virtualenv })).toBeUndefined();
  });
});

describe('opening the environment of a snapshot', () => {
  it('gives the base its own environment and keeps the head one', () => {
    const base = temporaryRoot();
    const head = temporaryRoot();
    write(base, 'uv.lock', 'new');
    write(head, 'uv.lock', 'old');
    write(head, '.venv/bin/.keep');
    withTools((tools, file) => installRecordingManager(tools, 'uv', { log: file }));

    const baseLauncher = openSnapshotEnvironment({ projectRoot: base, liveRoot: head });
    const headLauncher = openSnapshotEnvironment({ projectRoot: head, liveRoot: head });

    expect(baseLauncher.launch('ruff', ['check'])).toEqual({
      command: 'ruff',
      args: ['check'],
      env: {
        VIRTUAL_ENV: path.join(base, '.venv'),
        PATH: `${path.join(base, '.venv', 'bin')}${path.delimiter}${process.env.PATH}`,
      },
    });
    expect(headLauncher.launch('ruff', ['check'])).toEqual({
      command: 'uv',
      args: ['run', '--project', head, '--no-sync', '--', 'ruff', 'check'],
      env: {},
    });
  });
});
