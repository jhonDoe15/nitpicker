import { ts } from './syntax/typed.mts';
import type TypeScript from 'typescript';
import { toPosix } from '../unused-api/test-only/typed/layout-views.mts';
import type { PackagesInfo } from '../unused-api/workspace/workspace-types.mts';
import type { DesignLayout } from './typed/views.mts';
import { codeFilesUnder } from '../unused-api/program.mts';
import { projectModules } from '../unused-api/test-only/project-modules.mts';
import {
  EVERYTHING,
  NAMED_EXPORTS,
  isCovered,
  reexportGraph,
} from '../unused-api/test-only/reexport-graph.mts';
import { publicFilesOf } from '../unused-api/test-only/reexported-exports.mts';

export type PublicSurface = {
  isPublished(declaration: TypeScript.Node): boolean;
  isWholeModule(sourceFile: TypeScript.SourceFile): boolean;
};

type SurfaceOptions = {
  projectRoot: string;
  packagesInfo: PackagesInfo;
  layout: DesignLayout;
};

const NOTHING_PUBLISHED: PublicSurface = { isPublished: () => false, isWholeModule: () => false };

function exportNames(
  checker: TypeScript.TypeChecker,
  sourceFile: TypeScript.SourceFile,
): Map<TypeScript.Node, string[]> {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const names = new Map<TypeScript.Node, string[]>();
  for (const symbol of moduleSymbol === undefined ? [] : checker.getExportsOfModule(moduleSymbol)) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const local = (target.declarations ?? []).filter((node) => node.getSourceFile() === sourceFile);
    for (const declaration of local) {
      names.set(declaration, [...(names.get(declaration) ?? []), symbol.name]);
    }
  }
  return names;
}

function publishedEntryFiles({ projectRoot, packagesInfo, layout }: SurfaceOptions): string[] {
  const files = codeFilesUnder([projectRoot], layout, projectRoot).map(toPosix);
  return publicFilesOf({ files, projectRoot, packagesInfo, layout }).filter(
    (file) => packagesInfo.packageOf(file)?.published === true,
  );
}

export type PublishedNames = {
  isCoveredName(file: string, name: string): boolean;
  isWholeFile(file: string): boolean;
};

export function publishedNames(options: SurfaceOptions): PublishedNames | undefined {
  const entries = publishedEntryFiles(options);
  if (entries.length === 0) {
    return undefined;
  }
  const surface = reexportGraph(projectModules(options)).surfaceOf(entries);
  return {
    isCoveredName: (file, name) => isCovered(surface, { file: toPosix(file), name }),
    isWholeFile: (file) =>
      [EVERYTHING, NAMED_EXPORTS].some((name) => surface.has(`${toPosix(file)}\0${name}`)),
  };
}

export function publicSurface({
  checker,
  ...options
}: SurfaceOptions & { checker: TypeScript.TypeChecker }): PublicSurface {
  const published = publishedNames(options);
  if (published === undefined) {
    return NOTHING_PUBLISHED;
  }
  const namesByFile = new Map<TypeScript.SourceFile, Map<TypeScript.Node, string[]>>();
  function namesOf(sourceFile: TypeScript.SourceFile): Map<TypeScript.Node, string[]> {
    const names = namesByFile.get(sourceFile) ?? exportNames(checker, sourceFile);
    namesByFile.set(sourceFile, names);
    return names;
  }
  return {
    isPublished(declaration: TypeScript.Node) {
      const sourceFile = declaration.getSourceFile();
      const names = namesOf(sourceFile).get(declaration) ?? [];
      return names.some((name) => published.isCoveredName(sourceFile.fileName, name));
    },
    isWholeModule: (sourceFile: TypeScript.SourceFile) =>
      published.isWholeFile(sourceFile.fileName),
  };
}
