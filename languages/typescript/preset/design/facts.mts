import type TypeScript from 'typescript';
import { ts } from './syntax/typed.mts';
import { callableFact } from './callables/callable-facts.mts';
import { indexConstants, moduleReferences } from './callables/calls/references.mts';
import { collectCallbackSites, collectNamedSites } from './callables/sites.mts';
import { globMatcher } from '../unused-api/test-only/typed/layout-views.mts';
import { moduleFacts, ownedFiles } from './project.mts';
import { type PublicSurface, publicSurface } from './publication.mts';
import { collectTypes, typeFact } from './types/declarations.mts';
import type {
  DesignFacts,
  OwnedFile,
  Registry,
  Site,
  State,
  TypeEntry,
  TypeFact,
} from './design-types.mts';
import type { DesignContext, DesignLayout, Frameworks } from './typed/views.mts';
import type { PackagesInfo } from '../unused-api/workspace/workspace-types.mts';

function projectModuleTest(options: TypeScript.CompilerOptions): (specifier: string) => boolean {
  const patterns = Object.keys(options.paths ?? {}).map((pattern) =>
    pattern.endsWith('*') ? pattern.slice(0, -1) : pattern,
  );
  return (specifier: string) =>
    options.baseUrl !== undefined ||
    ts.isExternalModuleNameRelative(specifier) ||
    patterns.some((prefix) => specifier.startsWith(prefix));
}

function createState({
  context,
  files,
  frameworks,
}: {
  context: DesignContext;
  files: readonly OwnedFile[];
  frameworks: Frameworks | undefined;
}): State {
  return {
    checker: context.checker,
    mayBeProjectModule: projectModuleTest(context.program.getCompilerOptions()),
    frameworkDefaults: (frameworks?.defaultExports ?? []).map((glob: string) => globMatcher(glob)),
    registry: {
      owned: new Set(files.map(({ sourceFile }) => sourceFile.fileName)),
      entries: [],
      typeIds: new Map(),
      typeByNode: new Map(),
      exportedByFile: new Map(),
      sites: [],
      siteCounts: new Map(),
      siteNames: new Set(),
      siteByNode: new Map(),
      constructorByClass: new Map(),
      importsByFile: new Map(),
      classNames: new Set(),
      enumNames: new Set(),
      fieldNames: new Set(),
      enumCases: new Set(),
      constantNames: new Set(),
      heldByConstant: new Map(),
    },
  };
}

function indexTypes(registry: Registry): void {
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

function indexFields(
  registry: Registry,
  types: readonly { kind: string; fields?: readonly { name: string }[] }[],
): void {
  for (const { fields = [], kind } of types) {
    for (const { name } of kind === 'module' ? [] : fields) {
      registry.fieldNames.add(name);
    }
  }
}

function isPublishedType(surface: PublicSurface, entry: TypeEntry): boolean {
  if (entry.kind === 'module') {
    return ts.isSourceFile(entry.node) && surface.isWholeModule(entry.node);
  }
  return entry.exported && surface.isPublished(entry.anchor ?? entry.node);
}

function isPublishedCallable(surface: PublicSurface, site: Site): boolean {
  return (
    site.member === undefined &&
    site.callback !== true &&
    site.exported &&
    surface.isPublished(site.anchor ?? site.declaration)
  );
}

function withModuleReferences(state: State, entry: TypeEntry): TypeFact {
  const fact = typeFact(state, entry);
  const references =
    entry.kind === 'module' && ts.isSourceFile(entry.node)
      ? moduleReferences(state, entry.node)
      : [];
  return references.length === 0 ? fact : { ...fact, references };
}

function marked<T extends object>(fact: T, published: boolean): T {
  return published ? { ...fact, published } : fact;
}

export function designFacts({
  context,
  layout,
  packagesInfo,
  frameworks,
  projectRoot,
}: {
  context: DesignContext;
  layout: DesignLayout;
  packagesInfo: PackagesInfo;
  frameworks: Frameworks | undefined;
  projectRoot: string;
}): DesignFacts {
  const files = ownedFiles(context, layout);
  const state = createState({ context, files, frameworks });
  collectTypes(files, state);
  indexTypes(state.registry);
  collectNamedSites(files, state);
  collectCallbackSites(files, state);
  indexConstants(files, state.registry);
  const surface = publicSurface({ checker: context.checker, projectRoot, packagesInfo, layout });
  const { entries, sites } = state.registry;
  const types = entries.map((entry) =>
    marked(withModuleReferences(state, entry), isPublishedType(surface, entry)),
  );
  indexFields(state.registry, types);
  return {
    modules: moduleFacts(files, layout),
    types,
    callables: sites.map((site) =>
      marked(callableFact(state, site), isPublishedCallable(surface, site)),
    ),
  };
}
