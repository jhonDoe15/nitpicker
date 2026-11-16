import path from 'node:path';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import { isTable, tomlTable, type TomlTable } from '../../configuration/project-files.mts';
import { byText } from '../../../../../shared/text-order/by-text.mjs';

const PRIVATE_CLASSIFIER = 'Private :: Do Not Upload';

function ancestors(file: string): string[] {
  const parts = file.split('/').slice(0, -1);
  return ['', ...parts.map((_, index) => parts.slice(0, index + 1).join('/'))];
}

function poetryOf(table: TomlTable): unknown {
  return fieldOf(fieldOf(table, 'tool'), 'poetry');
}

function classifiersOf(table: TomlTable): unknown[] {
  const lists = [fieldOf(table['project'], 'classifiers'), fieldOf(poetryOf(table), 'classifiers')];
  return lists.flatMap((list) => listOf(list));
}

function isDistribution(table: TomlTable): boolean {
  return isTable(table['project']) || isTable(poetryOf(table));
}

function isPublished(table: TomlTable): boolean {
  const backend = fieldOf(table['build-system'], 'build-backend');
  const buildable = typeof backend === 'string' && backend !== '';
  return buildable && !classifiersOf(table).includes(PRIVATE_CLASSIFIER);
}

function moduleName(name: string): string {
  return name.toLowerCase().replaceAll(/[-.]+/gu, '_');
}

function poetryIncludes(table: TomlTable): unknown[] {
  return listOf(fieldOf(poetryOf(table), 'packages')).map((entry) => fieldOf(entry, 'include'));
}

function topModules(table: TomlTable): string[] {
  const pyModules = fieldOf(fieldOf(fieldOf(table, 'tool'), 'setuptools'), 'py-modules');
  const names = [
    fieldOf(table['project'], 'name'),
    fieldOf(poetryOf(table), 'name'),
    ...listOf(pyModules),
    ...poetryIncludes(table),
  ];
  return [...new Set(names.filter((name) => typeof name === 'string').map(moduleName))];
}

function pyprojectName(root: string): string {
  return root === '' ? 'pyproject.toml' : path.posix.join(root, 'pyproject.toml');
}

export function designDistributions(
  projectRoot: string,
  files: readonly string[],
): { root: string; published: boolean; modules: string[] }[] {
  const roots = [...new Set(files.flatMap((file) => ancestors(file)))].sort(byText);
  const distributions: { root: string; published: boolean; modules: string[] }[] = [];
  for (const root of roots) {
    const table = tomlTable(projectRoot, pyprojectName(root));
    if (table !== undefined && isDistribution(table)) {
      distributions.push({ root, published: isPublished(table), modules: topModules(table) });
    }
  }
  return distributions;
}
