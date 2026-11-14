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

export function publicSurface({
  checker,
  projectRoot,
  packagesInfo,
  layout,
}: SurfaceOptions & { checker: TypeScript.TypeChecker }): PublicSurface {
  const entries = publishedEntryFiles({ projectRoot, packagesInfo, layout });
  if (entries.length === 0) {
    return NOTHING_PUBLISHED;
  }
  const surface = reexportGraph(projectModules({ packagesInfo, layout })).surfaceOf(entries);
  const namesByFile = new Map<TypeScript.SourceFile, Map<TypeScript.Node, string[]>>();
  function namesOf(sourceFile: TypeScript.SourceFile): Map<TypeScript.Node, string[]> {
    const names = namesByFile.get(sourceFile) ?? exportNames(checker, sourceFile);
    namesByFile.set(sourceFile, names);
    return names;
  }
  return {
    isPublished(declaration: TypeScript.Node) {
      const sourceFile = declaration.getSourceFile();
      const file = toPosix(sourceFile.fileName);
      const names = namesOf(sourceFile).get(declaration) ?? [];
      return names.some((name) => isCovered(surface, { file, name }));
    },
    isWholeModule(sourceFile: TypeScript.SourceFile) {
      const file = toPosix(sourceFile.fileName);
      return [EVERYTHING, NAMED_EXPORTS].some((name) => surface.has(`${file}\0${name}`));
    },
  };
}
