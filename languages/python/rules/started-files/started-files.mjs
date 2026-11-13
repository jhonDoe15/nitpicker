import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readTextIfExists } from '../../../../shared/filesystem.mjs';
import { shellCommands } from '../../../../shared/started-files/shell-commands.mjs';
import { workflowCommands } from '../../../../shared/started-files/workflow-commands.mjs';
import { depthFirst } from '../../../../shared/traversal.mjs';
import { tomlTable } from '../../adapters/configuration/project-files.mjs';

const PYPROJECT = 'pyproject.toml';
const WORKFLOWS = '.github/workflows';
const WORKFLOW_FILE = /\.ya?ml$/u;
const LAUNCHERS = new Set(['uv', 'poetry', 'pipenv', 'pdm', 'hatch']);
const PYTHON = /^(?:python3?(?:\.\d+)?|py)$/u;
const MODULE_NAME = /^[A-Za-z_][\w.]*$/u;
const UNRESOLVED = /[$*{}`]/u;
const ASSIGNMENT = /^[A-Za-z_]\w*=/u;
const DESCRIPTIVE_KEYS = new Set(['description', 'help', 'name', 'version', 'readme', 'license']);

function workflowTexts(projectRoot) {
  const directory = path.join(projectRoot, WORKFLOWS);
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => WORKFLOW_FILE.test(name))
        .map((name) => readTextIfExists(path.join(directory, name)))
    : [];
}

function commandChildren({ value, key }) {
  if (DESCRIPTIVE_KEYS.has(key) || typeof value !== 'object' || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => ({ value: entry, key }));
  }
  return Object.entries(value).map(([name, entry]) => ({ value: entry, key: name }));
}

function commandStrings(root) {
  return [...depthFirst({ value: root, key: '' }, commandChildren)]
    .filter(({ value, key }) => typeof value === 'string' && !DESCRIPTIVE_KEYS.has(key))
    .map(({ value }) => value);
}

function afterLauncher(tokens) {
  const first = tokens.findIndex((token) => !ASSIGNMENT.test(token));
  const rest = first < 0 ? [] : tokens.slice(first);
  const launcher = LAUNCHERS.has(rest[0] ?? '') && rest[1] === 'run';
  return launcher ? rest.slice(2) : rest;
}

function startedBy({ tokens, directory }) {
  const rest = afterLauncher(tokens);
  const interpreter = PYTHON.test(rest[0] ?? '');
  const launchArguments = interpreter ? rest.slice(1) : rest;
  const moduleFlag = launchArguments.indexOf('-m');
  if (interpreter && moduleFlag >= 0 && MODULE_NAME.test(launchArguments[moduleFlag + 1] ?? '')) {
    return { module: launchArguments[moduleFlag + 1] };
  }
  const file = launchArguments.find((token) => !token.startsWith('-'));
  const runs = file?.endsWith('.py') === true && !UNRESOLVED.test(file);
  return runs ? { file: path.posix.normalize(path.posix.join(directory, file)) } : {};
}

export function startedPythonFiles(projectRoot) {
  const pyproject = tomlTable(projectRoot, PYPROJECT)?.tool;
  const commands = [
    ...commandStrings(pyproject).map((command) => ({ command, directory: '' })),
    ...workflowTexts(projectRoot).flatMap((text) => workflowCommands(text)),
  ];
  const started = commands
    .flatMap(({ command, directory }) => shellCommands(command, directory))
    .map((segment) => startedBy(segment));
  return {
    files: started.map(({ file }) => file).filter((file) => file !== undefined),
    modules: started.map(({ module }) => module).filter((module) => module !== undefined),
  };
}
