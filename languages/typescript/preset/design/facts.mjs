import ts from 'typescript';
import { callableFact } from './callables/callable-facts.mjs';
import { collectCallbackSites, collectNamedSites } from './callables/sites.mjs';
import { globMatcher } from '../layout.mjs';
import { moduleFacts, ownedFiles, packageFacts } from './project.mjs';
import { collectTypes, typeFact } from './types/declarations.mjs';

function projectModuleTest(options) {
  const patterns = Object.keys(options.paths ?? {}).map((pattern) =>
    pattern.endsWith('*') ? pattern.slice(0, -1) : pattern,
  );
  return (specifier) =>
    options.baseUrl !== undefined ||
    ts.isExternalModuleNameRelative(specifier) ||
    patterns.some((prefix) => specifier.startsWith(prefix));
}

function createState({ context, files, frameworks }) {
  return {
    checker: context.checker,
    mayBeProjectModule: projectModuleTest(context.program.getCompilerOptions()),
    frameworkDefaults: (frameworks?.defaultExports ?? []).map((glob) => globMatcher(glob)),
    registry: {
      owned: new Set(files.map(({ sourceFile }) => sourceFile.fileName)),
      entries: [],
      typeIds: new Map(),
      typeByNode: new Map(),
      exportedByFile: new Map(),
      sites: [],
      siteIds: new Set(),
      siteNames: new Set(),
      siteByNode: new Map(),
      constructorByClass: new Map(),
      importsByFile: new Map(),
      classNames: new Set(),
      enumNames: new Set(),
      fieldNames: new Set(),
      enumCases: new Set(),
    },
  };
}

function indexTypes(registry) {
  for (const entry of registry.entries) {
    const kind = entry.node.kind;
    if (kind === ts.SyntaxKind.ClassDeclaration) {
      registry.classNames.add(entry.name);
    }
    if (kind === ts.SyntaxKind.EnumDeclaration) {
      registry.enumNames.add(entry.name);
    }
    for (const name of entry.cases ?? []) {
      registry.enumCases.add(name);
    }
  }
}

function indexFields(registry, types) {
  for (const { fields = [], kind } of types) {
    for (const { name } of kind === 'module' ? [] : fields) {
      registry.fieldNames.add(name);
    }
  }
}

/** The `modules`, `packages`, `types` and `callables` lists of the facts bundle for the owned production files. */
export function designFacts({ context, layout, packagesInfo, frameworks, projectRoot }) {
  const files = ownedFiles(context, layout);
  const state = createState({ context, files, frameworks });
  collectTypes(files, state);
  indexTypes(state.registry);
  collectNamedSites(files, state);
  collectCallbackSites(files, state);
  const types = state.registry.entries.map((entry) => typeFact(state, entry));
  indexFields(state.registry, types);
  return {
    modules: moduleFacts(files, layout),
    packages: packageFacts(packagesInfo, projectRoot),
    types,
    callables: state.registry.sites.map((site) => callableFact(state, site)),
  };
}
