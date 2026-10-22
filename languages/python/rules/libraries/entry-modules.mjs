import { globMatcher } from '../../../../shared/paths/glob.mjs';
import { readProjectFile, tomlTable } from '../../adapters/configuration/project-files.mjs';
import { parseIni } from '../../adapters/configuration/pytest/ini-file.mjs';

const OBJECT_REFERENCE = /^\s*([A-Za-z_][\w.]*)\s*(?::|\[|$)/u;

function moduleOf(reference) {
  const match = OBJECT_REFERENCE.exec(reference);
  return match === null ? undefined : match[1];
}

function valuesOf(table) {
  return table !== null && typeof table === 'object'
    ? Object.values(table).filter((value) => typeof value === 'string')
    : [];
}

function groupsOf(table) {
  return table !== null && typeof table === 'object'
    ? Object.values(table).flatMap((group) => valuesOf(group))
    : [];
}

function pyprojectReferences(projectRoot) {
  const table = tomlTable(projectRoot, 'pyproject.toml');
  if (table === undefined) {
    return [];
  }
  return [
    ...valuesOf(table.project?.scripts),
    ...valuesOf(table.project?.['gui-scripts']),
    ...groupsOf(table.project?.['entry-points']),
    ...valuesOf(table.tool?.poetry?.scripts),
    ...groupsOf(table.tool?.poetry?.plugins),
    ...valuesOf(table.tool?.flit?.scripts),
  ];
}

function setupReferences(projectRoot) {
  const text = readProjectFile(projectRoot, 'setup.cfg');
  const points = text === undefined ? undefined : parseIni(text).get('options.entry_points');
  return [...(points?.values() ?? [])].flatMap((block) =>
    block.split('\n').flatMap((line) => {
      const [, value] = line.split('=');
      return value === undefined ? [] : [value];
    }),
  );
}

export function readEntryModules(projectRoot) {
  const references = [...pyprojectReferences(projectRoot), ...setupReferences(projectRoot)];
  return [...new Set(references.map(moduleOf).filter((name) => name !== undefined))].sort();
}

export function entryFilesOf(sources, globs) {
  const matchers = globs.map((glob) => globMatcher(glob));
  return sources.filter((file) => matchers.some((matcher) => matcher.test(file)));
}
