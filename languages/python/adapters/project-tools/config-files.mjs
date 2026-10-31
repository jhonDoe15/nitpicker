import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectFormatConfigFiles } from '../formatting/project-format-config.mjs';
import { readCoverageSettings } from '../configuration/coverage-config/python-coverage-config.mjs';
import { attempt } from './project-tool-layers.mjs';
import { PYRIGHT_JSON, readProjectPyright } from './pyright/pyright-project-config.mjs';

const TOOL_CONFIG_FILES = [PYRIGHT_JSON, 'pyproject.toml', 'mypy.ini', '.mypy.ini', 'setup.cfg'];
const MUTATION_CONFIG_FILES = ['pyproject.toml', 'setup.cfg'];
const PYRIGHT_CHECKERS = ['pyright', 'basedpyright'];

function coverageFiles(root) {
  const { value, error } = attempt(() => readCoverageSettings(root));
  const file = value?.file ?? error?.file;
  return file === undefined ? [] : [file];
}

function existing(root, names) {
  return names.map((name) => path.join(root, name)).filter((file) => existsSync(file));
}

export function pythonConfigFiles(root) {
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

export function mutationConfigFiles(root) {
  return existing(root, MUTATION_CONFIG_FILES);
}
