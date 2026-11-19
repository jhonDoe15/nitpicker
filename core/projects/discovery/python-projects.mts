import { fieldOf, isPlainObject } from '../../../shared/values/readers.mts';
import type { WorkspaceDeclaration } from '../project-types.mts';
import {
  readPyproject as untypedReadPyproject,
  uvWorkspaceOf as untypedUvWorkspaceOf,
} from '../../configuration/project-checks/uv-workspace.mts';
import { workspaceMembers } from './javascript-workspaces.mts';

const readPyproject: (directory: string) => unknown = untypedReadPyproject;
const uvWorkspaceOf: (directory: string) => object | undefined = untypedUvWorkspaceOf;

const UV_ORIGIN = 'uv workspace';
export const PYTHON_MARKERS = [
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'Pipfile',
  'requirements.txt',
];
export const PYTHON_PROJECT_MARKERS = PYTHON_MARKERS.filter(
  (marker) => marker !== 'requirements.txt',
);

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function uvPatterns(workspace: unknown): string[] {
  return [
    ...stringsOf(fieldOf(workspace, 'members')),
    ...stringsOf(fieldOf(workspace, 'exclude')).map((pattern) => `!${pattern}`),
  ];
}

function isPythonPackage(pyproject: unknown): boolean {
  return (
    isPlainObject(fieldOf(pyproject, 'project')) ||
    isPlainObject(fieldOf(fieldOf(pyproject, 'tool'), 'poetry'))
  );
}

export function pythonWorkspace(
  root: string,
  pythonDirectories: readonly string[],
): WorkspaceDeclaration {
  const workspace = uvWorkspaceOf(root);
  if (workspace === undefined) {
    return { declared: false, members: [] };
  }
  const own = isPythonPackage(readPyproject(root)) ? [{ path: '.', origin: UV_ORIGIN }] : [];
  const members = workspaceMembers(uvPatterns(workspace), pythonDirectories);
  return {
    declared: true,
    members: [...own, ...members.map((directory) => ({ path: directory, origin: UV_ORIGIN }))],
  };
}
