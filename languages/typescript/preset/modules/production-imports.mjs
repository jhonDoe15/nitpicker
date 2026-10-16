import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { resolveModuleSpecifier } from './module-resolution.mjs';

function specifiersOf(file) {
  return ts
    .preProcessFile(readFileSync(file, 'utf8'), true, true)
    .importedFiles.map(({ fileName }) => fileName);
}

function projectPath(projectRoot, file) {
  return path.relative(projectRoot, file).split(path.sep).join('/');
}

function importedFiles(projectRoot, importer) {
  const file = path.join(projectRoot, importer);
  return specifiersOf(file)
    .map((specifier) => resolveModuleSpecifier(specifier, file).path)
    .filter((target) => target !== undefined)
    .map((target) => projectPath(projectRoot, realpathSync(target)));
}

export function productionImports(projectRoot, importers) {
  const root = realpathSync(projectRoot);
  return new Map(
    importers
      .filter((importer) => existsSync(path.join(root, importer)))
      .toSorted()
      .toReversed()
      .flatMap((importer) => importedFiles(root, importer).map((target) => [target, importer])),
  );
}
