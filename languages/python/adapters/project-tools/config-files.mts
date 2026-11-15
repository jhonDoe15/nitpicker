import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectFormatConfigFiles } from '../formatting/project-format-config.mts';
import { readCoverageSettings } from '../configuration/coverage-config/python-coverage-config.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { attempt } from './project-tool-layers.mts';
import { PYRIGHT_JSON, readProjectPyright } from './pyright/pyright-project-config.mts';

const PYTEST_CONFIG_FILES = ['pytest.toml', '.pytest.toml', 'pytest.ini', '.pytest.ini', 'tox.ini'];
const TOOL_CONFIG_FILES = [
  PYRIGHT_JSON,
  'pyproject.toml',
  'mypy.ini',
  '.mypy.ini',
  'setup.cfg',
  ...PYTEST_CONFIG_FILES,
];
const MUTATION_CONFIG_FILES = ['pyproject.toml', 'setup.cfg'];
const PYRIGHT_CHECKERS = ['pyright', 'basedpyright'];

function coverageFiles(root: string): string[] {
  const { value, error } = attempt(() => readCoverageSettings(root));
  const failed = fieldOf(error, 'file');
  const file = value?.file ?? (typeof failed === 'string' ? failed : undefined);
  return file === undefined ? [] : [file];
}

function existing(root: string, names: readonly string[]): string[] {
  return names.map((name) => path.join(root, name)).filter((file) => existsSync(file));
}

export function pythonConfigFiles(root: string): string[] {
  return [
    ...new Set([
      ...projectFormatConfigFiles(root),
      ...existing(root, [...TOOL_CONFIG_FILES, ...coverageFiles(root)]),
      ...PYRIGHT_CHECKERS.flatMap(
        (checker) => readProjectPyright(root, checker, { upward: true })?.files ?? [],
      ),
    ]),
  ];
}

export function mutationConfigFiles(root: string): string[] {
  return existing(root, MUTATION_CONFIG_FILES);
}
