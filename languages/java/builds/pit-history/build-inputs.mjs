import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.kotlin',
  'build',
  'node_modules',
  'target',
]);
const BUILD_FILE_NAMES = new Set([
  'pom.xml',
  'gradle.properties',
  'gradle-wrapper.properties',
  'maven-wrapper.properties',
  'extensions.xml',
  'maven.config',
  'jvm.config',
]);
const BUILD_FILE_SUFFIXES = ['.gradle', '.gradle.kts', '.versions.toml'];

function isBuildInput(relativePath) {
  const segments = relativePath.split(path.sep);
  const name = segments.at(-1);
  return (
    BUILD_FILE_NAMES.has(name) ||
    BUILD_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix)) ||
    segments.slice(0, -1).includes('resources')
  );
}

function isAnalyzed(entry, root) {
  const relativePath = path.relative(root, path.join(entry.parentPath, entry.name));
  return (
    entry.isFile() &&
    !relativePath.split(path.sep).some((segment) => SKIPPED_DIRECTORIES.has(segment)) &&
    isBuildInput(relativePath)
  );
}

function readInside(root, entry) {
  const file = path.resolve(entry.parentPath, entry.name);
  if (!file.startsWith(`${root}${path.sep}`)) {
    return [];
  }
  return [[path.relative(root, file), readFileSync(file)]];
}

function buildInputs(directory) {
  const root = path.resolve(directory);
  return new Map(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => isAnalyzed(entry, root))
      .flatMap((entry) => readInside(root, entry)),
  );
}

export function sameBuildInputs(headRoot, baseRoot) {
  if (![headRoot, baseRoot].every((root) => root !== undefined && existsSync(root))) {
    return false;
  }
  const head = buildInputs(headRoot);
  const base = buildInputs(baseRoot);
  return (
    head.size === base.size &&
    [...head].every(([file, content]) => base.get(file)?.equals(content) === true)
  );
}
