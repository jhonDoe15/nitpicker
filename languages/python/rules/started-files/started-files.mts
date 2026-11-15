import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  depthFirst,
  readTextIfExists,
  shellCommands,
  workflowCommands,
  type CommandNode,
} from './typed/started-views.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { tomlTable } from '../../adapters/configuration/project-files.mts';

const PYPROJECT = 'pyproject.toml';
const WORKFLOWS = '.github/workflows';
const WORKFLOW_FILE = /\.ya?ml$/u;
const LAUNCHERS = new Set(['uv', 'poetry', 'pipenv', 'pdm', 'hatch']);
const PYTHON = /^(?:python3?(?:\.\d+)?|py)$/u;
const MODULE_NAME = /^[A-Za-z_][\w.]*$/u;
const UNRESOLVED = /[$*{}`]/u;
const ASSIGNMENT = /^[A-Za-z_]\w*=/u;
const DESCRIPTIVE_KEYS = new Set(['description', 'help', 'name', 'version', 'readme', 'license']);

function workflowTexts(projectRoot: string): string[] {
  const directory = path.join(projectRoot, WORKFLOWS);
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => WORKFLOW_FILE.test(name))
        .map((name) => readTextIfExists(path.join(directory, name)))
    : [];
}

function commandChildren({ value, key }: CommandNode): CommandNode[] {
  if (DESCRIPTIVE_KEYS.has(key) || typeof value !== 'object' || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry: unknown) => ({ value: entry, key }));
  }
  return Object.entries(value).map(([name, entry]: [string, unknown]) => ({
    value: entry,
    key: name,
  }));
}

function commandStrings(root: unknown): string[] {
  return [...depthFirst({ value: root, key: '' }, commandChildren)].flatMap(({ value, key }) =>
    typeof value === 'string' && !DESCRIPTIVE_KEYS.has(key) ? [value] : [],
  );
}

function afterLauncher(tokens: readonly string[]): readonly string[] {
  const first = tokens.findIndex((token) => !ASSIGNMENT.test(token));
  const rest = first < 0 ? [] : tokens.slice(first);
  const launcher = LAUNCHERS.has(rest[0] ?? '') && rest[1] === 'run';
  return launcher ? rest.slice(2) : rest;
}

type Segment = { readonly tokens: readonly string[]; readonly directory: string };
type Started = { readonly module?: string | undefined; readonly file?: string | undefined };

function startedBy({ tokens, directory }: Segment): Started {
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

export type StartedFiles = { files: string[]; modules: string[] };

export function startedPythonFiles(projectRoot: string): StartedFiles {
  const pyproject = fieldOf(tomlTable(projectRoot, PYPROJECT), 'tool');
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
