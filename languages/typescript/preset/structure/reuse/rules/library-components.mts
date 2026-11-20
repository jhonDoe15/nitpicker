import { RULE_IDS, isScopePackage, reuseFinding } from '../typed/reuse-views.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import type { Finding } from '../../../../../../shared/values/findings.mts';
import type { ImportFact, DefinitionFact } from '../typed/syntax-types.mts';
import type { ModuleResolution, Resolve, ReuseFact } from '../typed/reuse-types.mts';

type FactsByPath = ReadonlyMap<string, ReuseFact>;
type Lookup = { readonly resolve: Resolve; readonly factsByPath: FactsByPath };
type Context = {
  readonly analyzerName: string;
  readonly resolve: Resolve;
  readonly isExcepted: (rule: string, ...candidates: readonly string[]) => boolean;
  readonly dependenciesOf: (packageRoot: string) => ReadonlySet<string>;
};
type Entry = { readonly name: string; readonly package: string; readonly home: string | undefined };
type Rendered = {
  readonly rendered: Map<string, Map<string, Set<string>>>;
  readonly homes: Map<string, string>;
};
type Library = { readonly name: string; readonly count: number };
type Candidate = {
  readonly fact: ReuseFact;
  readonly definition: DefinitionFact;
  readonly library: Library;
};

const COMPONENT_FILE = /\.[jt]sx$/u;
const COMPONENT_NAME = /^[A-Z][\dA-Z]*[a-z][\dA-Za-z]*$/u;

function renderedNames(declaration: ImportFact, jsxTags: ReadonlySet<string>): string[] {
  const lastSegment = declaration.specifier.split('/').at(-1);
  const isDeepDefault =
    declaration.defaultName === lastSegment && declaration.specifier.includes('/');
  const named = declaration.named
    .filter(({ typeOnly, local }) => !typeOnly && jsxTags.has(local))
    .map(({ imported }) => imported);
  const deepDefault =
    isDeepDefault && lastSegment !== undefined && jsxTags.has(lastSegment) ? [lastSegment] : [];
  return declaration.typeOnly
    ? []
    : [...named, ...deepDefault].filter((name) => COMPONENT_NAME.test(name));
}

function isComponentPackage(
  target: ModuleResolution,
  dependencies: ReadonlySet<string>,
): target is ModuleResolution & { readonly name: string } {
  return (
    target.kind === 'package' &&
    target.name !== undefined &&
    dependencies.has(target.name) &&
    !isScopePackage('icons', target.name)
  );
}

function packageImportsOf(fact: ReuseFact, context: Context & Lookup): Entry[] {
  const dependencies = context.dependenciesOf(fact.packageRoot);
  return fact.imports.flatMap((declaration) => {
    const target = context.resolve(declaration.specifier, fact.path);
    const home =
      target.path === undefined ? undefined : context.factsByPath.get(target.path)?.packageRoot;
    return isComponentPackage(target, dependencies)
      ? renderedNames(declaration, fact.jsxTags).map((name) => ({
          name,
          package: target.name,
          home,
        }))
      : [];
  });
}

function renderedComponents(facts: readonly ReuseFact[], context: Context & Lookup): Rendered {
  const entries = facts.flatMap((fact) =>
    packageImportsOf(fact, context).map((entry) => ({ ...entry, file: fact.path })),
  );
  const rendered = new Map<string, Map<string, Set<string>>>();
  for (const entry of entries) {
    const packages = rendered.get(entry.name) ?? new Map<string, Set<string>>();
    rendered.set(entry.name, packages);
    packages.set(entry.package, new Set([...(packages.get(entry.package) ?? []), entry.file]));
  }
  const homes = new Map(
    entries.flatMap((entry) =>
      entry.home === undefined ? [] : [[entry.package, entry.home] as const],
    ),
  );
  return { rendered, homes };
}

function librariesFor(
  definition: DefinitionFact,
  fact: ReuseFact,
  { rendered, homes }: Rendered,
): Map<string, Set<string>> {
  return new Map(
    [...(rendered.get(definition.name) ?? [])].filter(
      ([name]) => homes.get(name) !== fact.packageRoot,
    ),
  );
}

function mostUsedPackage(packages: ReadonlyMap<string, ReadonlySet<string>>): Library | undefined {
  const candidates = [...packages].map(([name, files]) => ({ name, count: files.size }));
  return candidates.reduce<Library | undefined>(
    (best, candidate) =>
      best === undefined ||
      candidate.count - best.count > 0 ||
      (candidate.count === best.count && candidate.name.localeCompare(best.name) < 0)
        ? candidate
        : best,
    undefined,
  );
}

function isComponent(definition: DefinitionFact): boolean {
  return definition.component && COMPONENT_NAME.test(definition.name);
}

function boundNames({ defaultName, namespaceName, named }: ImportFact): (string | undefined)[] {
  return [defaultName, namespaceName, ...named.map(({ local }) => local)];
}

function forwardedSpecifiers(fact: ReuseFact): string[] {
  const exportedLocals = new Set<string | undefined>(fact.exports.locals.map(({ local }) => local));
  function forwardsBinding(declaration: ImportFact): boolean {
    return boundNames(declaration).some((name) => exportedLocals.has(name));
  }
  return [
    ...fact.exports.reexports.map(({ specifier }) => specifier),
    ...fact.exports.namespaces.map(({ specifier }) => specifier),
    ...fact.imports.filter(forwardsBinding).map(({ specifier }) => specifier),
  ];
}

function reachedPackages(fact: ReuseFact, { resolve, factsByPath }: Lookup): Set<string> {
  const seen = new Set([fact.path]);
  const pending = fact.imports.map(({ specifier }) => ({ specifier, from: fact.path }));
  const packages = new Set<string>();
  for (const { specifier, from } of pending) {
    const target = resolve(specifier, from);
    if (target.kind === 'package' && target.name !== undefined) {
      packages.add(target.name);
    }
    const next =
      target.kind === 'file' && target.path !== undefined
        ? factsByPath.get(target.path)
        : undefined;
    if (next !== undefined && !seen.has(next.path)) {
      seen.add(next.path);
      appendAll(
        pending,
        forwardedSpecifiers(next).map((forwarded) => ({ specifier: forwarded, from: next.path })),
      );
    }
  }
  return packages;
}

function importsFromAny(fact: ReuseFact, packages: ReadonlySet<string>, context: Lookup): boolean {
  return [...reachedPackages(fact, context)].some((name) => packages.has(name));
}

function finding(analyzerName: string, { fact, definition, library }: Candidate): Finding {
  const files = library.count === 1 ? '1 file' : `${String(library.count)} files`;
  return reuseFinding(analyzerName, {
    key: 'redefinedLibraryComponent',
    path: fact.path,
    identity: `component:${definition.name}`,
    symbol: definition.name,
    line: definition.line,
    values: { name: definition.name, package: library.name, count: files },
  });
}

function candidatesIn(fact: ReuseFact, components: Rendered, lookup: Lookup): Candidate[] {
  return fact.definitions
    .filter(isComponent)
    .map((definition) => ({
      fact,
      definition,
      libraries: librariesFor(definition, fact, components),
    }))
    .filter(
      ({ libraries }) =>
        libraries.size > 0 && !importsFromAny(fact, new Set(libraries.keys()), lookup),
    )
    .flatMap(({ definition, libraries }) => {
      const library = mostUsedPackage(libraries);
      return library === undefined ? [] : [{ fact, definition, library }];
    });
}

export function redefinedLibraryComponentFindings(
  facts: readonly ReuseFact[],
  context: Context,
): Finding[] {
  const lookup: Lookup = {
    resolve: context.resolve,
    factsByPath: new Map(facts.map((f) => [f.path, f])),
  };
  const components = renderedComponents(facts, { ...context, factsByPath: lookup.factsByPath });
  return facts
    .filter(
      ({ path: p }) =>
        COMPONENT_FILE.test(p) && !context.isExcepted(RULE_IDS.redefinedLibraryComponent, p),
    )
    .flatMap((fact) => candidatesIn(fact, components, lookup))
    .map((candidate) => finding(context.analyzerName, candidate));
}
