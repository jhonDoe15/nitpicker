import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { repositoryRootOf } from '../detection/repository.mjs';

const MINIMUM_RANGE = /^>=\s*(?<version>\d+(?:\.\d+){0,2})$/u;

export function requiredNodeRange(packageRoot = PACKAGE_ROOT) {
  return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).engines.node;
}

function numbers(version) {
  return version.replace(/^v/u, '').split('.').map(Number);
}

export function assertSupportedNode(nodeVersion, range = requiredNodeRange()) {
  const minimum = MINIMUM_RANGE.exec(range.trim())?.groups.version;
  if (minimum === undefined) {
    return;
  }
  const actual = numbers(nodeVersion);
  const difference =
    numbers(minimum)
      .map((part, index) => (actual[index] ?? 0) - part)
      .find((delta) => delta !== 0) ?? 0;
  if (difference < 0) {
    throw new Error(
      `nitpicker needs Node.js ${minimum} or newer (engines "${range}" in its package.json), and this is Node.js ${nodeVersion}. Install a newer Node.js and run nitpicker init again.`,
    );
  }
}

export function requireRepository(projectRoot) {
  const repository = repositoryRootOf(projectRoot);
  if (repository === undefined) {
    throw new Error(
      `${projectRoot} is not in a Git repository. nitpicker compares your changes with their merge base, so it needs one: run git init, commit, and run nitpicker init again.`,
    );
  }
  return repository;
}
