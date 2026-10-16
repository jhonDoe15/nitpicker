import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { globToRegExp } from '../../layout.mjs';
import { publicEntryGlobs, workspacePaths } from '../workspace/entries.mjs';
import { entriesOf, keyOf } from './knip-report.mjs';
import { moduleSyntax, namesExport, reexportGraph } from './reexport-graph.mjs';

function resolutionOptions({ projectRoot, layout, packagesInfo }) {
  const configFile = path.join(projectRoot, 'tsconfig.json');
  const config = existsSync(configFile)
    ? ts.readConfigFile(configFile, (file) => ts.sys.readFile(file))
    : undefined;
  const parsed = ts.parseJsonConfigFileContent(
    config?.config ?? {},
    ts.sys,
    projectRoot,
    {},
    configFile,
  );
  return {
    ...parsed.options,
    allowJs: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: { ...workspacePaths(packagesInfo.packages, layout), ...parsed.options.paths },
    pathsBasePath: parsed.options.pathsBasePath ?? projectRoot,
  };
}

function resolver(options) {
  return (specifier, containingFile) => {
    const { resolvedModule } = ts.resolveModuleName(specifier, containingFile, options, ts.sys);
    return resolvedModule?.isExternalLibraryImport === false
      ? resolvedModule.resolvedFileName
      : undefined;
  };
}

function resolveSources(items, { file, resolve }) {
  return items
    .map((item) => ({ ...item, source: resolve(item.specifier, file) }))
    .filter(({ source }) => source !== undefined);
}

function resolvedModule(file, resolve) {
  const text = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const { edges, references } = moduleSyntax(sourceFile);
  return {
    edges: resolveSources(edges, { file, resolve }),
    references: resolveSources(references, { file, resolve }),
  };
}

function publicEntryFiles({ files, projectRoot, layout, packagesInfo }) {
  const entryPoints = (layout.entryPoints ?? []).map((glob) =>
    globToRegExp(path.join(projectRoot, glob)),
  );
  return packagesInfo.packages
    .filter(({ published }) => published)
    .flatMap((entry) => {
      const globs = publicEntryGlobs(entry, layout).map((glob) => globToRegExp(glob));
      return files.filter(
        (file) =>
          packagesInfo.packageOf(file) === entry &&
          [...globs, ...entryPoints].some((glob) => glob.test(file)),
      );
    });
}

function modulesOf(files, { projectRoot, resolve }) {
  return files
    .map((file) => path.join(projectRoot, file))
    .map((file) => [file, resolvedModule(file, resolve)]);
}

function projectModules(project) {
  const { projectRoot, layout } = project;
  const resolve = resolver(resolutionOptions(project));
  const files = layout.projectCodeFiles(projectRoot);
  const production = new Map(
    modulesOf(
      files.filter((file) => layout.isSourceFile(file)),
      { projectRoot, resolve },
    ),
  );
  const tests = modulesOf(
    files.filter((file) => layout.isTestFile(file)),
    { projectRoot, resolve },
  );
  return {
    graph: reexportGraph(
      production,
      publicEntryFiles({ ...project, files: [...production.keys()] }),
    ),
    testReferences: tests.flatMap(([, { edges, references }]) => [...edges, ...references]),
  };
}

function importedTarget({ graph, revealed }, specifier) {
  const edge = graph.importedEdge(specifier.file, specifier.name);
  if (edge === undefined) return undefined;
  const { references, edges } = graph.consumers(edge.source, edge.imported);
  const isOnlyReexported = edges.every(
    ({ from, exported, viaImport }) => viaImport && revealed.has(`${from}\0${exported}`),
  );
  return references.length === 0 &&
    isOnlyReexported &&
    !graph.isReexportSpecifier(edge.source, edge.imported)
    ? { file: edge.source, name: edge.imported }
    : undefined;
}

function declarationsHidden(context, specifier) {
  const { graph } = context;
  if (graph.isPublic(specifier.file, specifier.name)) return [];
  if (!graph.isReexportSpecifier(specifier.file, specifier.name)) {
    return graph.reexports(specifier.file, specifier.name)
      ? [{ specifier, target: specifier }]
      : [];
  }
  const target = importedTarget(context, specifier);
  return target === undefined || graph.isPublic(target.file, target.name)
    ? []
    : [{ specifier, target }];
}

function isUsedByTests({ item, target }, { unusedEverywhere, testReferences }) {
  return (
    !unusedEverywhere.has(keyOf(item)) ||
    testReferences.some((reference) => namesExport(reference, target.file, target.name))
  );
}

function asDeclaration(item, target, projectRoot) {
  const file = path.relative(projectRoot, target.file);
  const isItself = file === item.file && target.name === item.entry.name;
  return isItself ? item : { file, category: item.category, entry: { name: target.name } };
}

export function reexportedTestOnlyEntries({ production, runs, packagesInfo, layout, projectRoot }) {
  const { graph, testReferences } = projectModules({ projectRoot, layout, packagesInfo });
  if (!graph.hasReexports) return [];
  const reported = new Set(entriesOf(production).map(keyOf));
  const revealed = entriesOf(runs.production())
    .filter((item) => item.category !== 'files' && !reported.has(keyOf(item)))
    .map((item) => ({ item, file: path.join(projectRoot, item.file), name: item.entry.name }));
  const context = {
    graph,
    revealed: new Set(revealed.map(({ file, name }) => `${file}\0${name}`)),
  };
  const hidden = revealed.flatMap(({ item, file, name }) =>
    declarationsHidden(context, { file, name }).map((found) => ({ item, ...found })),
  );
  if (hidden.length === 0) return [];
  const unusedEverywhere = new Set(entriesOf(runs.normal()).map(keyOf));
  const declarations = hidden
    .filter((found) => isUsedByTests(found, { unusedEverywhere, testReferences }))
    .map(({ item, target }) => asDeclaration(item, target, projectRoot));
  return [...new Map(declarations.map((item) => [keyOf(item), item])).values()];
}
