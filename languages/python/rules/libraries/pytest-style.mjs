import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readProjectFile, tomlTable } from '../../adapters/configuration/project-files.mjs';
import {
  fixtureCounts,
  markCounts,
  mostCommon,
  parametrizeUses,
  parenthesesChoice,
} from './pytest-measures.mjs';

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

function isTable(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function explicitOptions(projectRoot) {
  const pyproject = tomlTable(projectRoot, 'pyproject.toml')?.tool?.ruff;
  const tables = [
    pyproject?.lint?.[SECTION],
    pyproject?.[SECTION],
    ...CONFIG_FILES.flatMap((file) => {
      const table = tomlTable(projectRoot, file);
      return [table?.lint?.[SECTION], table?.[SECTION]];
    }),
  ].filter(isTable);
  return Object.assign({}, ...tables.reverse().map((table) => pick(table)));
}

function pick(table) {
  return Object.fromEntries(
    OPTION_KEYS.filter((key) => key in table).map((key) => [key, table[key]]),
  );
}

function skipsFolder(name) {
  return name.startsWith('.') || SKIPPED_FOLDERS.has(name) || name.endsWith('.egg-info');
}

export function pythonFilesOf(projectRoot) {
  const found = [];
  const pending = [''];
  while (pending.length > 0 && found.length < MAX_FILES) {
    const folder = pending.pop();
    for (const entry of readdirSync(path.join(projectRoot, folder), { withFileTypes: true })) {
      const relative = path.posix.join(folder, entry.name);
      if (entry.isDirectory() && !skipsFolder(entry.name)) {
        pending.push(relative);
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        found.push(relative);
      }
    }
  }
  return found;
}

function textOf(projectRoot, file) {
  return readProjectFile(projectRoot, file) ?? '';
}

function measuredOptions(texts) {
  const uses = texts.flatMap(parametrizeUses);
  const candidates = {
    'fixture-parentheses': parenthesesChoice(texts.map(fixtureCounts)),
    'mark-parentheses': parenthesesChoice(texts.map(markCounts)),
    'parametrize-names-type': mostCommon(uses.map((use) => use.names)),
    'parametrize-values-type': mostCommon(uses.map((use) => use.values)),
    'parametrize-values-row-type': mostCommon(uses.map((use) => use.row)),
  };
  return Object.fromEntries(Object.entries(candidates).filter(([, value]) => value !== undefined));
}

export function pytestStyle(projectRoot, files = pythonFilesOf(projectRoot)) {
  const texts = files.map((file) => textOf(projectRoot, file));
  return { ...measuredOptions(texts), ...explicitOptions(projectRoot) };
}

function tomlValue(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

export function pytestStyleFlags(style) {
  return Object.entries(style).flatMap(([key, value]) => [
    '--config',
    `lint.${SECTION}.${key} = ${tomlValue(value)}`,
  ]);
}
