import path from 'node:path';
import { lstatIfExists } from '../../../../core/tooling/policy-links.mjs';
import { realpathSync } from 'node:fs';

export function validatedProjectFile(projectRoot, filePath) {
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

export function normalizedRelativePath(value, context) {
  const normalizedPath = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (
    normalizedPath.length === 0 ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    path.posix.isAbsolute(normalizedPath) ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    throw new Error(`${context} must stay within the project root`);
  }
  return normalizedPath;
}

export function validatedContainedFile(root, relativePath, context) {
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

export function assertContainedPath(root, candidate, context) {
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
