import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { filesUnder } from '../../../../../shared/filesystem.mjs';
import { existingRoots } from '../../layout.mjs';
import { isNonProductionFolder, isReuseProductionPath } from './reuse-paths.mjs';
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
    .filter(
      (file) =>
        layout.isSourceFile(file) && !layout.isGeneratedPath(file) && isReuseProductionPath(file),
    )
    .map((file) => fileFacts(projectRoot, file, packageRootOf(file)));
}

const SVG_TAG = /<svg\b[^>]*>/iu;
const SVG_HEAD_BYTES = 4096;

function attributeNumbers(tag, name) {
  const value = new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'iu').exec(tag)?.[1];
  return value === undefined
    ? []
    : value
        .split(/[\s,]+/u)
        .map((part) => Number.parseFloat(part))
        .filter((number) => !Number.isNaN(number));
}

function svgSize(text) {
  const tag = SVG_TAG.exec(text.slice(0, SVG_HEAD_BYTES))?.[0] ?? '';
  const [, , boxWidth, boxHeight] = attributeNumbers(tag, 'viewBox');
  const [width] = attributeNumbers(tag, 'width');
  const [height] = attributeNumbers(tag, 'height');
  return boxWidth === undefined ? { width, height } : { width: boxWidth, height: boxHeight };
}

function relativePath(projectRoot, absolute) {
  return path.relative(projectRoot, absolute).split(path.sep).join('/');
}

export function svgFiles(projectRoot, layout) {
  function isSkipped(relative) {
    return (
      layout.isExcluded(relative) ||
      layout.isTestPath(relative) ||
      layout.isGeneratedPath(relative) ||
      isNonProductionFolder(relative)
    );
  }
  return existingRoots(projectRoot, layout.sourceRoots)
    .flatMap((root) => [
      ...filesUnder(path.join(projectRoot, root), {
        skipDirectory: (absolute) => isSkipped(relativePath(projectRoot, absolute)),
      }),
    ])
    .map((absolute) => relativePath(projectRoot, absolute))
    .filter((relative) => /\.svg$/iu.test(relative) && !isSkipped(relative))
    .toSorted()
    .map((relative) => ({
      path: relative,
      size: svgSize(readFileSync(path.join(projectRoot, relative), 'utf8')),
    }));
}
