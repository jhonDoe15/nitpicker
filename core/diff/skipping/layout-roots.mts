import { existsSync } from 'node:fs';
import path from 'node:path';
import { detectSourceRoots } from '../../../languages/python/adapters/execution/python-project.mts';
import { resolveLayoutFor } from '../../../languages/typescript/preset/layout.mjs';
import { objectOf } from '../../../shared/values/readers.mts';

function hasPythonMarker(projectRoot: string): boolean {
  return (
    existsSync(path.join(projectRoot, 'pyproject.toml')) ||
    existsSync(path.join(projectRoot, 'setup.py')) ||
    existsSync(path.join(projectRoot, 'setup.cfg'))
  );
}

function pythonRoots(projectRoot: string): string[] {
  return hasPythonMarker(projectRoot) ? detectSourceRoots(projectRoot) : [];
}

export function layoutRoots({
  headPolicy,
  headProjectRoot,
}: {
  readonly headPolicy: unknown;
  readonly headProjectRoot: string;
}): string[] {
  const layout: { readonly sourceRoots: readonly string[]; readonly testRoots: readonly string[] } =
    resolveLayoutFor(objectOf(headPolicy));
  return [...layout.sourceRoots, ...layout.testRoots, ...pythonRoots(headProjectRoot)];
}
