import { RULE_IDS } from '../../../../../../shared/policy.mjs';
import { isScopePackage } from '../../../eslint-config/scope-support.mjs';
import { reuseFinding } from '../finding.mjs';

const COMPONENT_FILE = /\.[jt]sx$/u;
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/u;

function renderedNames(declaration, jsxTags) {
  const lastSegment = declaration.specifier.split('/').at(-1);
  const isDeepDefault =
    declaration.defaultName === lastSegment && declaration.specifier.includes('/');
  const named = declaration.named
    .filter(({ typeOnly, local }) => !typeOnly && jsxTags.has(local))
    .map(({ imported }) => imported);
  const deepDefault = isDeepDefault && jsxTags.has(lastSegment) ? [lastSegment] : [];
  return declaration.typeOnly
    ? []
    : [...named, ...deepDefault].filter((name) => COMPONENT_NAME.test(name));
}

function isComponentPackage(target, dependencies) {
  return (
    target.kind === 'package' &&
    dependencies.has(target.name) &&
    !isScopePackage('icons', target.name)
  );
}

function packageImportsOf(fact, context) {
  const dependencies = context.dependenciesOf(fact.packageRoot);
  return fact.imports.flatMap((declaration) => {
    const target = context.resolve(declaration.specifier, fact.path);
    const home = context.factsByPath.get(target.path)?.packageRoot;
    return isComponentPackage(target, dependencies)
      ? renderedNames(declaration, fact.jsxTags).map((name) => ({
          name,
          package: target.name,
          home,
        }))
      : [];
  });
}

function renderedComponents(facts, context) {
  const entries = facts.flatMap((fact) =>
    packageImportsOf(fact, context).map((entry) => ({ ...entry, file: fact.path })),
  );
  const rendered = new Map();
  for (const entry of entries) {
    const packages = rendered.get(entry.name) ?? new Map();
    rendered.set(entry.name, packages);
    packages.set(entry.package, new Set([...(packages.get(entry.package) ?? []), entry.file]));
  }
  const homes = new Map(
    entries.filter(({ home }) => home !== undefined).map((entry) => [entry.package, entry.home]),
  );
  return { rendered, homes };
}

function librariesFor(definition, fact, { rendered, homes }) {
  return new Map(
    [...(rendered.get(definition.name) ?? [])].filter(
      ([name]) => homes.get(name) !== fact.packageRoot,
    ),
  );
}

function mostUsedPackage(packages) {
  return [...packages]
    .map(([name, files]) => ({ name, count: files.size }))
    .toSorted((left, right) => right.count - left.count || left.name.localeCompare(right.name))[0];
}

function isComponent(definition) {
  return definition.component && COMPONENT_NAME.test(definition.name);
}

function boundNames({ defaultName, namespaceName, named }) {
  return [defaultName, namespaceName, ...named.map(({ local }) => local)];
}

function forwardedSpecifiers(fact) {
  const exportedLocals = new Set(fact.exports.locals.map(({ local }) => local));
  function forwardsBinding(declaration) {
    return boundNames(declaration).some((name) => exportedLocals.has(name));
  }
  return [
    ...fact.exports.reexports.map(({ specifier }) => specifier),
    ...fact.exports.namespaces,
    ...fact.imports.filter(forwardsBinding).map(({ specifier }) => specifier),
  ];
}

function reachedPackages(fact, { resolve, factsByPath }) {
  const seen = new Set([fact.path]);
  const pending = fact.imports.map(({ specifier }) => ({ specifier, from: fact.path }));
  const packages = new Set();
  for (const { specifier, from } of pending) {
    const target = resolve(specifier, from);
    if (target.kind === 'package') packages.add(target.name);
    const next = target.kind === 'file' ? factsByPath.get(target.path) : undefined;
    if (next !== undefined && !seen.has(next.path)) {
      seen.add(next.path);
      pending.push(
        ...forwardedSpecifiers(next).map((forwarded) => ({
          specifier: forwarded,
          from: next.path,
        })),
      );
    }
  }
  return packages;
}

function importsFromAny(fact, packages, context) {
  return [...reachedPackages(fact, context)].some((name) => packages.has(name));
}

function finding(analyzerName, { fact, definition, library }) {
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

function candidatesIn(fact, components, lookup) {
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
    .map(({ definition, libraries }) => ({
      fact,
      definition,
      library: mostUsedPackage(libraries),
    }));
}

export function redefinedLibraryComponentFindings(facts, context) {
  const lookup = { resolve: context.resolve, factsByPath: new Map(facts.map((f) => [f.path, f])) };
  const components = renderedComponents(facts, { ...context, factsByPath: lookup.factsByPath });
  return facts
    .filter(
      ({ path: p }) =>
        COMPONENT_FILE.test(p) && !context.isExcepted(RULE_IDS.redefinedLibraryComponent, p),
    )
    .flatMap((fact) => candidatesIn(fact, components, lookup))
    .map((candidate) => finding(context.analyzerName, candidate));
}
