import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { isReuseProductionPath } from './reuse-paths.mjs';
import { fileDefinitions } from './syntax/definitions.mjs';
import { fileDynamicImports, fileExports, fileImports } from './syntax/module-facts.mjs';
import { jsxTagNames, referencePositions } from './syntax/references.mjs';

function manifestDirectory(projectRoot, file) {
  const directory = path.posix.dirname(file);
  const parts = directory === '.' ? [] : directory.split('/');
  const candidates = [...parts.keys()].map((depth) =>
    parts.slice(0, parts.length - depth).join('/'),
  );
  return [...candidates, ''].find((candidate) =>
    existsSync(path.join(projectRoot, candidate, 'package.json')),
  );
}

function packageRootFinder(projectRoot, layout) {
  const known = new Map();
  return (file) => {
    const directory = path.posix.dirname(file);
    if (!known.has(directory)) {
      const sourceRoot = layout.sourceRoots.find((root) => file.startsWith(`${root}/`));
      known.set(directory, manifestDirectory(projectRoot, file) ?? sourceRoot ?? '');
    }
    return known.get(directory);
  };
}

function usedLocally(definition, references) {
  const [start, end] = definition.span;
  return (references.get(definition.name) ?? []).some((at) => at < start || at >= end);
}

function fileFacts(projectRoot, file, packageRoot) {
  const text = readFileSync(path.join(projectRoot, file), 'utf8');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const references = referencePositions(sourceFile);
  return {
    path: file,
    packageRoot,
    definitions: fileDefinitions(sourceFile).map((definition) => ({
      ...definition,
      usedLocally: usedLocally(definition, references),
    })),
    imports: fileImports(sourceFile),
    dynamicImports: fileDynamicImports(sourceFile),
    exports: fileExports(sourceFile),
    jsxTags: jsxTagNames(sourceFile),
  };
}

export function productionFacts(projectRoot, layout) {
  const packageRootOf = packageRootFinder(projectRoot, layout);
  return layout
    .projectCodeFiles(projectRoot, layout.sourceRoots)
    .filter((file) => layout.isSourceFile(file) && isReuseProductionPath(file))
    .map((file) => fileFacts(projectRoot, file, packageRootOf(file)));
}
