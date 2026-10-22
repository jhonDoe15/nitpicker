import path from 'node:path';

export const VENV_DIRECTORY = '.venv';
const CONSTRAINTS_FILE = /^constraints/;
const LOCAL_PACKAGE_LOCK = /"(?:editable|path|file)"\s*:/;

const LOCK_TOOLS = [
  {
    kind: 'uv',
    lock: 'uv.lock',
    binary: 'uv',
    args: ['sync', '--frozen', '--no-install-project', '--no-install-workspace'],
    variables: (directory) => ({ UV_PROJECT_ENVIRONMENT: directory }),
  },
  {
    kind: 'poetry',
    lock: 'poetry.lock',
    binary: 'poetry',
    args: ['install', '--no-root', '--no-interaction'],
    variables: () => ({ POETRY_VIRTUALENVS_IN_PROJECT: 'true' }),
  },
  {
    kind: 'pdm',
    lock: 'pdm.lock',
    binary: 'pdm',
    args: ['sync', '--no-self'],
    variables: () => ({ PDM_VENV_IN_PROJECT: 'true', PDM_CHECK_UPDATE: 'false' }),
  },
  {
    kind: 'pipenv',
    lock: 'Pipfile.lock',
    binary: 'pipenv',
    args: ['sync', '--dev'],
    variables: () => ({ PIPENV_VENV_IN_PROJECT: '1', PIPENV_IGNORE_VIRTUALENVS: '1' }),
    forbids: LOCAL_PACKAGE_LOCK,
  },
];

export function lockTool(files, setting) {
  const named = LOCK_TOOLS.find((tool) => tool.kind === setting);
  return (
    named ??
    (setting === undefined ? LOCK_TOOLS.find((tool) => files.includes(tool.lock)) : undefined)
  );
}

export function lockStep(tool, directory) {
  return {
    kind: tool.kind,
    command: [tool.binary, ...tool.args],
    variables: tool.variables(directory),
  };
}

export function requirementsNames(files) {
  return files.filter(
    (name) => name.endsWith('.txt') && !CONSTRAINTS_FILE.test(path.basename(name)),
  );
}

const WINDOWS = 'win32';

export function environmentBin(directory) {
  return path.join(directory, process.platform === WINDOWS ? 'Scripts' : 'bin');
}

export function venvStep(directory) {
  return {
    kind: 'python',
    command: [process.platform === WINDOWS ? 'python' : 'python3', '-m', 'venv', directory],
    variables: {},
  };
}

export function pipSteps({ projectRoot, requirementsFile, constraints }) {
  const directory = path.join(projectRoot, VENV_DIRECTORY);
  const python = path.join(
    environmentBin(directory),
    process.platform === WINDOWS ? 'python.exe' : 'python',
  );
  return [
    venvStep(directory),
    {
      kind: 'python',
      command: [
        python,
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        '--no-input',
        '--prefer-binary',
        '-r',
        requirementsFile,
        ...constraints.flatMap((file) => ['-c', file]),
      ],
      variables: {},
    },
  ];
}
