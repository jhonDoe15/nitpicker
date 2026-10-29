import ts from 'typescript';
import { toPosix } from '../layout.mjs';
import { codeFilesUnder } from '../unused-api/program.mjs';
import { projectModules } from '../unused-api/test-only/project-modules.mjs';
import {
  EVERYTHING,
  NAMED_EXPORTS,
  isCovered,
  reexportGraph,
} from '../unused-api/test-only/reexport-graph.mjs';
import { publicFilesOf } from '../unused-api/test-only/reexported-exports.mjs';

const NOTHING_PUBLISHED = { isPublished: () => false, isWholeModule: () => false };

function exportNames(checker, sourceFile) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const names = new Map();
  for (const symbol of moduleSymbol === undefined ? [] : checker.getExportsOfModule(moduleSymbol)) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const local = (target.declarations ?? []).filter((node) => node.getSourceFile() === sourceFile);
    for (const declaration of local) {
      names.set(declaration, [...(names.get(declaration) ?? []), symbol.name]);
    }
  }
  return names;
}

function publishedEntryFiles({ projectRoot, packagesInfo, layout }) {
  const files = codeFilesUnder([projectRoot], layout, projectRoot).map(toPosix);
  return publicFilesOf({ files, projectRoot, packagesInfo, layout }).filter(
    (file) => packagesInfo.packageOf(file)?.published === true,
  );
}

export function publicSurface({ checker, projectRoot, packagesInfo, layout }) {
  const entries = publishedEntryFiles({ projectRoot, packagesInfo, layout });
  if (entries.length === 0) {
    return NOTHING_PUBLISHED;
  }
  const surface = reexportGraph(projectModules({ packagesInfo, layout })).surfaceOf(entries);
  const namesByFile = new Map();
  function namesOf(sourceFile) {
    if (!namesByFile.has(sourceFile)) {
      namesByFile.set(sourceFile, exportNames(checker, sourceFile));
    }
    return namesByFile.get(sourceFile);
  }
  return {
    isPublished(declaration) {
      const sourceFile = declaration.getSourceFile();
      const file = toPosix(sourceFile.fileName);
      const names = namesOf(sourceFile).get(declaration) ?? [];
      return names.some((name) => isCovered(surface, { file, name }));
    },
    isWholeModule(sourceFile) {
      const file = toPosix(sourceFile.fileName);
      return [EVERYTHING, NAMED_EXPORTS].some((name) => surface.has(`${file}\0${name}`));
    },
  };
}
