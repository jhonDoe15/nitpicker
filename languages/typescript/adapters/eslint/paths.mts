import path from 'node:path';
import { lstatIfExists } from '../../../../core/tooling/policy-links.mjs';
import { realpathSync } from 'node:fs';
import { normalizedRelativePath as snapshotRelativePath } from '../static-checks/arguments.mts';

export function validatedProjectFile(
  projectRoot: string,
  filePath: string,
): { readonly relativePath: string; readonly canonicalPath: string } {
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(projectRoot, resolvedPath).replaceAll('\\', '/');
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`ESLint returned a path outside the analyzed snapshot: ${filePath}`);
  }
  const entry = lstatIfExists(resolvedPath);
  if (entry === undefined || !entry.isFile() || entry.isSymbolicLink()) {
    throw new Error(`ESLint returned a non-regular source file: ${filePath}`);
  }
  const canonicalPath = realpathSync(resolvedPath);
  assertContainedPath(projectRoot, canonicalPath, 'ESLint source');
  return { relativePath, canonicalPath };
}

export function normalizedRelativePath(value: string, context: string): string {
  return snapshotRelativePath(value, context, 'the project root');
}

export function validatedContainedFile(
  root: string,
  relativePath: string,
  context: string,
): { readonly normalizedPath: string; readonly canonicalPath: string } {
  const normalizedPath = normalizedRelativePath(relativePath, context);
  const resolvedPath = path.resolve(root, normalizedPath);
  assertContainedPath(root, resolvedPath, context);
  const entry = lstatIfExists(resolvedPath);
  if (entry === undefined || !entry.isFile() || entry.isSymbolicLink()) {
    throw new Error(`${context} must resolve to a regular file within its root`);
  }
  const canonicalPath = realpathSync(resolvedPath);
  assertContainedPath(root, canonicalPath, context);
  return { normalizedPath, canonicalPath };
}

export function assertContainedPath(root: string, candidate: string, context: string): void {
  const relativePath = path.relative(root, candidate);
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`${context} must stay within ${root}`);
  }
}
