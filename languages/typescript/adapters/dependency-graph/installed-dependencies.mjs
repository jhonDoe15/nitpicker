import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../../shared/filesystem.mjs';
import { containedPath } from './package-managers/contained-path.mjs';
import { managerRoot } from './package-managers/detect.mjs';

function holdsPackages(candidate) {
  return (
    existsSync(candidate) &&
    statSync(candidate).isDirectory() &&
    readdirSync(candidate).some((entry) => !entry.startsWith('.'))
  );
}

export function installedDependencies(projectRoot) {
  const ancestors = ancestorDirectories(path.resolve(projectRoot));
  const root = managerRoot(projectRoot);
  const upToRoot = ancestors.slice(0, Math.max(ancestors.indexOf(root), 0) + 1);
  return upToRoot.map((directory) => containedPath(directory, 'node_modules')).find(holdsPackages);
}
