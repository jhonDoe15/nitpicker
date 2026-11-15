import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { minimumNodeVersion, versionDifference } from '../../tooling/node-version/node-version.mts';
import { repositoryRootOf } from '../detection/repository.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

export function requiredNodeRange(packageRoot: string = PACKAGE_ROOT): string {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  return textOf(fieldOf(fieldOf(manifest, 'engines'), 'node'));
}

export function assertSupportedNode(
  nodeVersion: string,
  range: string = requiredNodeRange(),
): void {
  const minimum = minimumNodeVersion(range);
  if (minimum === undefined) {
    return;
  }
  if (versionDifference(nodeVersion, minimum) < 0) {
    throw new Error(
      `nitpicker needs Node.js ${minimum} or newer (engines "${range}" in its package.json), and this is Node.js ${nodeVersion}. Install a newer Node.js and run nitpicker init again.`,
    );
  }
}

export function requireRepository(projectRoot: string): string {
  const repository = repositoryRootOf(projectRoot);
  if (repository === undefined) {
    throw new Error(
      `${projectRoot} is not in a Git repository. nitpicker compares your changes with their merge base, so it needs one: run git init in the project folder or one above it, and run nitpicker init again.`,
    );
  }
  return repository;
}
