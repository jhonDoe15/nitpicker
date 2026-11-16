import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories as untypedAncestorDirectories } from '../../../../shared/filesystem.mjs';
import { containedPath } from './package-managers/contained-path.mts';
import { managerRoot } from './package-managers/detect.mts';

const ancestorDirectories: (directory: string) => string[] = untypedAncestorDirectories;

function holdsPackages(candidate: string): boolean {
  return (
    existsSync(candidate) &&
    statSync(candidate).isDirectory() &&
    readdirSync(candidate).some((entry) => !entry.startsWith('.'))
  );
}

export function installedDependencies(projectRoot: string): string | undefined {
  const ancestors = ancestorDirectories(path.resolve(projectRoot));
  const root = managerRoot(projectRoot);
  const upToRoot = ancestors.slice(0, Math.max(ancestors.indexOf(root), 0) + 1);
  return upToRoot.map((directory) => containedPath(directory, 'node_modules')).find(holdsPackages);
}
