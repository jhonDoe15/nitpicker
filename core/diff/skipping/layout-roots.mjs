import { existsSync } from 'node:fs';
import path from 'node:path';
import { detectSourceRoots } from '../../../languages/python/adapters/execution/python-project.mjs';
import { resolveLayoutFor } from '../../../languages/typescript/preset/layout.mjs';

const PYTHON_MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg'];

function hasPythonMarker(projectRoot) {
  for (const marker of PYTHON_MARKERS) {
    if (existsSync(path.join(projectRoot, marker))) {
      return true;
    }
  }
  return false;
}

function pythonRoots(projectRoot) {
  return hasPythonMarker(projectRoot) ? detectSourceRoots(projectRoot, undefined) : [];
}

export function layoutRoots({ headPolicy, headProjectRoot }) {
  const layout = resolveLayoutFor(headPolicy);
  return [...layout.sourceRoots, ...layout.testRoots, ...pythonRoots(headProjectRoot)];
}
