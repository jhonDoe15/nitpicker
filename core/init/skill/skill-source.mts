import { existsSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';
import { textOf } from '../../../shared/values/readers.mts';

const ancestorsOf: (directory: string) => string[] = ancestorDirectories;

const REPOSITORY = 'jhonDoe15/nitpicker';
const INSTALLED = path.join('node_modules', 'nitpicker');

function searchedDirectories(projectRoot: string, repository: string): string[] {
  const ancestors = ancestorsOf(projectRoot);
  const top = ancestors.indexOf(repository);
  return top === -1 ? [projectRoot] : ancestors.slice(0, top + 1);
}

function localSource(projectRoot: string, directory: string): string {
  const relative = path.relative(projectRoot, path.join(directory, INSTALLED)).split(path.sep);
  return relative[0] === '..' ? relative.join('/') : ['.', ...relative].join('/');
}

export function skillSource(
  projectRoot: string,
  { repository, version }: { readonly repository: string; readonly version: unknown },
): string {
  const installed = searchedDirectories(projectRoot, repository).find((directory) =>
    existsSync(path.join(directory, INSTALLED, 'package.json')),
  );
  return installed === undefined
    ? `${REPOSITORY}#v${textOf(version)}`
    : localSource(projectRoot, installed);
}
