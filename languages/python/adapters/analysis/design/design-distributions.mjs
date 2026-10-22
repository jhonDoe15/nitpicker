import path from 'node:path';
import { isTable, tomlTable } from '../../configuration/project-files.mjs';

const PRIVATE_CLASSIFIER = 'Private :: Do Not Upload';

function ancestors(file) {
  const parts = file.split('/').slice(0, -1);
  return ['', ...parts.map((_, index) => parts.slice(0, index + 1).join('/'))];
}

function classifiersOf(table) {
  const lists = [table.project?.classifiers, table.tool?.poetry?.classifiers];
  return lists.filter(Array.isArray).flat();
}

function isDistribution(table) {
  return isTable(table.project) || isTable(table.tool?.poetry);
}

function isPublished(table) {
  const backend = table['build-system']?.['build-backend'];
  const buildable = typeof backend === 'string' && backend !== '';
  return buildable && !classifiersOf(table).includes(PRIVATE_CLASSIFIER);
}

function pyprojectName(root) {
  return root === '' ? 'pyproject.toml' : path.posix.join(root, 'pyproject.toml');
}

export function designDistributions(projectRoot, files) {
  const roots = [...new Set(files.flatMap((file) => ancestors(file)))].sort();
  const distributions = [];
  for (const root of roots) {
    const table = tomlTable(projectRoot, pyprojectName(root));
    if (table !== undefined && isDistribution(table)) {
      distributions.push({ root, published: isPublished(table) });
    }
  }
  return distributions;
}
