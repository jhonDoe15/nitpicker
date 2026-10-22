import { isPlainObject } from '../../../../shared/config.mjs';
import { readPyproject } from '../../discovery/python-projects.mjs';

function pythonName(name) {
  return `pypi:${name.toLowerCase().replaceAll(/[-_.]+/gu, '-')}`;
}

function uvSources(pyproject) {
  const sources = pyproject.tool?.uv?.sources;
  return isPlainObject(sources) ? Object.entries(sources) : [];
}

function poetryDependencies(pyproject) {
  const poetry = pyproject.tool?.poetry;
  if (!isPlainObject(poetry)) {
    return [];
  }
  const groups = isPlainObject(poetry.group)
    ? Object.values(poetry.group).map((group) => group?.dependencies)
    : [];
  return [poetry.dependencies, poetry['dev-dependencies'], ...groups]
    .filter(isPlainObject)
    .flatMap((table) => Object.values(table));
}

function sourceFolders(pyproject) {
  return [...uvSources(pyproject).map(([, source]) => source), ...poetryDependencies(pyproject)]
    .filter((source) => isPlainObject(source) && typeof source.path === 'string')
    .map((source) => source.path);
}

function workspaceNeeds(pyproject) {
  return uvSources(pyproject)
    .filter(([, source]) => isPlainObject(source) && source.workspace === true)
    .map(([name]) => pythonName(name));
}

export function pythonUnit(directory) {
  const pyproject = readPyproject(directory);
  if (!isPlainObject(pyproject)) {
    return undefined;
  }
  const name = pyproject.project?.name ?? pyproject.tool?.poetry?.name;
  return {
    names: typeof name === 'string' ? [pythonName(name)] : [],
    needs: workspaceNeeds(pyproject),
    folders: sourceFolders(pyproject),
  };
}
