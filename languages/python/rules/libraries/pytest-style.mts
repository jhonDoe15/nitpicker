import { fieldOf } from '../../../../shared/values/readers.mts';
import { projectFilePaths } from './typed/file-views.mts';
import {
  isTable,
  readProjectFile,
  type TomlTable,
  tomlTable,
} from '../../adapters/configuration/project-files.mts';
import {
  fixtureCounts,
  markCounts,
  mostCommon,
  parametrizeUses,
  parenthesesChoice,
} from './pytest-measures.mts';

const SECTION = 'flake8-pytest-style';
const OPTION_KEYS = [
  'fixture-parentheses',
  'mark-parentheses',
  'parametrize-names-type',
  'parametrize-values-type',
  'parametrize-values-row-type',
];
const CONFIG_FILES = ['ruff.toml', '.ruff.toml'];
const SKIPPED_FOLDERS = new Set(['node_modules', 'venv', 'build', 'dist', 'site-packages']);
const MAX_FILES = 2000;

export type StyleOptions = Readonly<Record<string, unknown>>;

function explicitOptions(projectRoot: string): StyleOptions {
  const pyproject = fieldOf(fieldOf(tomlTable(projectRoot, 'pyproject.toml'), 'tool'), 'ruff');
  const tables = [
    fieldOf(fieldOf(pyproject, 'lint'), SECTION),
    fieldOf(pyproject, SECTION),
    ...CONFIG_FILES.flatMap((file) => {
      const table = tomlTable(projectRoot, file);
      return [fieldOf(fieldOf(table, 'lint'), SECTION), fieldOf(table, SECTION)];
    }),
  ].filter(isTable);
  return Object.fromEntries(tables.reverse().flatMap((table) => Object.entries(pick(table))));
}

function pick(table: TomlTable): StyleOptions {
  return Object.fromEntries(
    OPTION_KEYS.filter((key) => key in table).map((key) => [key, table[key]]),
  );
}

function skipsFolder(name: string): boolean {
  return name.startsWith('.') || SKIPPED_FOLDERS.has(name) || name.endsWith('.egg-info');
}

function depthOf(file: string): number {
  return file.split('/').length;
}

function pythonFilesOf(projectRoot: string): string[] {
  return projectFilePaths(projectRoot, { skipDirectory: (_, entry) => skipsFolder(entry.name) })
    .filter((file) => file.endsWith('.py'))
    .toSorted((left, right) => depthOf(left) - depthOf(right))
    .slice(0, MAX_FILES);
}

function textOf(projectRoot: string, file: string): string {
  return readProjectFile(projectRoot, file) ?? '';
}

function measuredOptions(texts: readonly string[]): StyleOptions {
  const uses = texts.flatMap(parametrizeUses);
  const candidates = {
    'fixture-parentheses': parenthesesChoice(texts.map(fixtureCounts))[0],
    'mark-parentheses': parenthesesChoice(texts.map(markCounts))[0],
    'parametrize-names-type': mostCommon(uses.map((use) => use.names)),
    'parametrize-values-type': mostCommon(uses.map((use) => use.values)),
    'parametrize-values-row-type': mostCommon(uses.map((use) => use.row)),
  };
  return Object.fromEntries(Object.entries(candidates).filter(([, value]) => value !== undefined));
}

export function pytestStyle(
  projectRoot: string,
  files: readonly string[] = pythonFilesOf(projectRoot),
  configRoot: string = projectRoot,
): StyleOptions {
  const texts = files.map((file) => textOf(projectRoot, file));
  return { ...measuredOptions(texts), ...explicitOptions(configRoot) };
}

function tomlValue(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

export function pytestStyleFlags(style: StyleOptions): string[] {
  return Object.entries(style).flatMap(([key, value]) => [
    '--config',
    `lint.${SECTION}.${key} = ${tomlValue(value)}`,
  ]);
}
