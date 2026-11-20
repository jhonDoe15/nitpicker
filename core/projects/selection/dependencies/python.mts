import { readPyproject as untypedReadPyproject } from '../../../configuration/project-checks/uv-workspace.mts';
import { fieldOf, isPlainObject, textOf } from '../../../../shared/values/readers.mts';
import type { DependencyUnit } from '../../project-types.mts';

const readPyproject: (directory: string) => unknown = untypedReadPyproject;

type Pyproject = Record<string, unknown>;

function pythonName(name: string): string {
  return `pypi:${name.toLowerCase().replaceAll(/[-_.]+/gu, '-')}`;
}

function uvSources(pyproject: Pyproject): [string, unknown][] {
  const sources = fieldOf(fieldOf(fieldOf(pyproject, 'tool'), 'uv'), 'sources');
  return isPlainObject(sources) ? Object.entries(sources) : [];
}

function poetryDependencies(pyproject: Pyproject): unknown[] {
  const poetry = fieldOf(fieldOf(pyproject, 'tool'), 'poetry');
  if (!isPlainObject(poetry)) {
    return [];
  }
  const group = poetry['group'];
  const groups = isPlainObject(group)
    ? Object.values(group).map((entry) => fieldOf(entry, 'dependencies'))
    : [];
  return [poetry['dependencies'], poetry['dev-dependencies'], ...groups]
    .filter(isPlainObject)
    .flatMap((table) => Object.values(table));
}

function sourceFolders(pyproject: Pyproject): string[] {
  return [...uvSources(pyproject).map(([, source]) => source), ...poetryDependencies(pyproject)]
    .filter((source) => isPlainObject(source) && typeof fieldOf(source, 'path') === 'string')
    .map((source) => textOf(fieldOf(source, 'path')));
}

function workspaceNeeds(pyproject: Pyproject): string[] {
  return uvSources(pyproject)
    .filter(([, source]) => isPlainObject(source) && source['workspace'] === true)
    .map(([name]) => pythonName(name));
}

export function pythonUnit(directory: string): DependencyUnit | undefined {
  const pyproject = readPyproject(directory);
  if (!isPlainObject(pyproject)) {
    return undefined;
  }
  const name =
    fieldOf(fieldOf(pyproject, 'project'), 'name') ??
    fieldOf(fieldOf(fieldOf(pyproject, 'tool'), 'poetry'), 'name');
  return {
    names: typeof name === 'string' ? [pythonName(name)] : [],
    needs: workspaceNeeds(pyproject),
    folders: sourceFolders(pyproject),
  };
}
