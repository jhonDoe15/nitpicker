import { existsSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../shared/filesystem.mjs';

const REPOSITORY = 'jhonDoe15/nitpicker';
const INSTALLED = path.join('node_modules', 'nitpicker');

function searchedDirectories(projectRoot, repository) {
  const ancestors = ancestorDirectories(projectRoot);
  const top = ancestors.indexOf(repository);
  return top === -1 ? [projectRoot] : ancestors.slice(0, top + 1);
}

function localSource(projectRoot, directory) {
  const relative = path.relative(projectRoot, path.join(directory, INSTALLED)).split(path.sep);
  return relative[0] === '..' ? relative.join('/') : ['.', ...relative].join('/');
}

export function skillSource(projectRoot, { repository, version }) {
  const installed = searchedDirectories(projectRoot, repository).find((directory) =>
    existsSync(path.join(directory, INSTALLED, 'package.json')),
  );
  return installed === undefined
    ? `${REPOSITORY}#v${version}`
    : localSource(projectRoot, installed);
}
