import { isProjectRoot, rootOf } from '../../layout/source-root/root-paths.mts';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mts';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../../shared/project-files/project-files.mts';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mts';
import { existingRoots } from '../../layout.mts';
import { isNonProductionFolder, isReuseProductionPath } from './reuse-paths.mts';
import { fileDefinitions } from './syntax/definitions.mts';
import { fileDynamicImports, fileExports, fileImports } from '../../syntax/module-facts.mts';
import { jsxTagNames, referencePositions } from '../../syntax/references.mts';
import { nearDuplicateUnits } from './near-duplicates/units.mts';
import type TypeScript from 'typescript';
import { engineReuseFacts, resolvedUnits, type EngineFileFacts } from '../engine/engine-reuse.mts';
import type { Environment } from '../engine/engine-files.mts';
import type { Definition } from './typed/syntax-types.mts';
import type {
  BaselineFile,
  ModuleOf,
  ReuseFact,
  ReuseLayout,
  SvgFile,
  SvgSize,
} from './typed/reuse-types.mts';

const projectFilesUnder: (
  root: string,
  options: { readonly skipDirectory: (absolute: string) => boolean },
) => string[] = untypedProjectFilesUnder;

function manifestDirectory(projectRoot: string, file: string): string | undefined {
  const directory = path.posix.dirname(file);
  const parts = directory === '.' ? [] : directory.split('/');
  const candidates = [...parts.keys()].map((depth) =>
    parts.slice(0, parts.length - depth).join('/'),
  );
  return [...candidates, ''].find((candidate) =>
    existsSync(path.join(projectRoot, candidate, 'package.json')),
  );
}

function packageRootFinder(projectRoot: string, layout: ReuseLayout): (file: string) => string {
  const known = new Map<string, string>();
  return (file) => {
    const directory = path.posix.dirname(file);
    const cached = known.get(directory);
    if (cached !== undefined) {
      return cached;
    }
    const sourceRoot = rootOf(layout.sourceRoots, file);
    const fallback = sourceRoot === undefined || isProjectRoot(sourceRoot) ? '' : sourceRoot;
    const found = manifestDirectory(projectRoot, file) ?? fallback;
    known.set(directory, found);
    return found;
  };
}

function usedLocally(
  definition: Definition,
  references: ReadonlyMap<string, readonly number[]>,
): boolean {
  const [start, end] = definition.span;
  return (references.get(definition.name) ?? []).some((at) => at < start || at >= end);
}

function insideRoot(root: string, file: string): string {
  const base = path.resolve(root);
  const full = path.resolve(base, file);
  if (!full.startsWith(`${base}${path.sep}`)) {
    throw new Error(`${file} is outside ${root}`);
  }
  return full;
}

function parsedFile(projectRoot: string, file: string): TypeScript.SourceFile {
  const text = readFileSync(insideRoot(projectRoot, file), 'utf8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

export function baselineFileReader({
  projectRoot,
  baselineRoot,
  baselinePaths,
}: {
  readonly projectRoot: string;
  readonly baselineRoot: string;
  readonly baselinePaths: ReadonlyMap<string, string>;
}): (file: string) => BaselineFile {
  const unknown: BaselineFile = { unchanged: false, definitions: [] };
  return (file) => {
    const baselinePath = baselinePaths.get(file) ?? file;
    const baselineFull = insideRoot(baselineRoot, baselinePath);
    if (!existsSync(baselineFull)) {
      return unknown;
    }
    const unchanged =
      readFileSync(baselineFull, 'utf8') === readFileSync(insideRoot(projectRoot, file), 'utf8');
    const definitions = unchanged ? [] : fileDefinitions(parsedFile(baselineRoot, baselinePath));
    return { unchanged, definitions };
  };
}

function fileFacts(
  { projectRoot, moduleOf }: { readonly projectRoot: string; readonly moduleOf: ModuleOf },
  file: string,
  packageRoot: string,
): ReuseFact {
  const sourceFile = parsedFile(projectRoot, file);
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
    nearDuplicateUnits: nearDuplicateUnits(sourceFile, file, {
      moduleOf: (specifier) => moduleOf(specifier, file),
    }),
  };
}

function engineFact(
  fact: EngineFileFacts,
  packageRoot: string,
  moduleOf: (specifier: string) => string,
): ReuseFact {
  return {
    path: fact.path,
    packageRoot,
    definitions: fact.definitions,
    imports: fact.imports,
    dynamicImports: fact.dynamicImports,
    exports: fact.exports,
    jsxTags: new Set(fact.jsxTags),
    nearDuplicateUnits: resolvedUnits(fact, moduleOf),
  };
}

export function productionFacts(
  projectRoot: string,
  layout: ReuseLayout,
  moduleOf: ModuleOf,
  environment: Environment = process.env,
): ReuseFact[] {
  const packageRootOf = packageRootFinder(projectRoot, layout);
  const files = layout
    .projectCodeFiles(projectRoot, layout.sourceRoots)
    .filter((file) => layout.isSourceFile(file) && isReuseProductionPath(file));
  const listed = files.map((file) => ({ path: insideRoot(projectRoot, file), display: file }));
  const engine = engineReuseFacts(listed, environment);
  return files.map((file) => {
    const fact = engine?.get(file);
    return fact === undefined
      ? fileFacts({ projectRoot, moduleOf }, file, packageRootOf(file))
      : engineFact(fact, packageRootOf(file), (specifier) => moduleOf(specifier, file));
  });
}

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
const SVG_TAG = /<svg\b[^>]*>/iu;
const SVG_HEAD_CHARACTERS = 4096;

function attributeNumbers(tag: string, name: string): number[] {
  const value = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*["']([^"']*)["']`, 'iu').exec(
    tag,
  )?.[1];
  return value === undefined
    ? []
    : value
        .split(/[\s,]+/u)
        .map((part) => Number.parseFloat(part))
        .filter((number) => !Number.isNaN(number));
}

function svgSize(text: string): SvgSize {
  const tag = SVG_TAG.exec(text.slice(0, SVG_HEAD_CHARACTERS))?.[0] ?? '';
  const [, , boxWidth, boxHeight] = attributeNumbers(tag, 'viewBox');
  const [width] = attributeNumbers(tag, 'width');
  const [height] = attributeNumbers(tag, 'height');
  return boxWidth === undefined ? { width, height } : { width: boxWidth, height: boxHeight };
}

function relativePath(projectRoot: string, absolute: string): string {
  return path.relative(projectRoot, absolute).split(path.sep).join('/');
}

export function svgFiles(projectRoot: string, layout: ReuseLayout): SvgFile[] {
  function isSkipped(relative: string): boolean {
    return (
      layout.isExcluded(relative) ||
      layout.isTestPath(relative) ||
      layout.isGeneratedPath(relative) ||
      isNonProductionFolder(relative)
    );
  }
  return existingRoots(projectRoot, layout.sourceRoots)
    .flatMap((root) => [
      ...projectFilesUnder(path.join(projectRoot, root), {
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
