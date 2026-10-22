import path from 'node:path';
import { hash } from '../../../../../shared/rules/finding-helpers.mjs';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function named(name, alias) {
  return alias === undefined || alias === name ? { name } : { name, alias };
}

function importRecords(fact) {
  const bindings = new Map(
    fact.imports.flatMap(({ specifier, named: names }) =>
      names.map(({ local, imported }) => [local, { specifier, imported }]),
    ),
  );
  return [
    ...fact.imports.map(({ specifier, defaultName, namespaceName, named: names }) => ({
      specifier,
      names: [
        ...(defaultName === undefined ? [] : [named('default', defaultName)]),
        ...(namespaceName === undefined ? [] : [named('*', namespaceName)]),
        ...names.map(({ imported, local }) => named(imported, local)),
      ],
    })),
    ...fact.dynamicImports.map((specifier) => ({ specifier, names: [named('*')] })),
    ...fact.exports.namespaces.map(({ specifier, name }) => ({
      specifier,
      names: [named('*', name)],
      reexport: true,
    })),
    ...fact.exports.reexports.map(({ specifier, star, names }) => ({
      specifier,
      names: star ? [named('*')] : names.map(({ imported, exported }) => named(imported, exported)),
      reexport: true,
    })),
    ...fact.exports.locals
      .filter(({ local }) => bindings.has(local))
      .map(({ local, exported }) => ({
        specifier: bindings.get(local).specifier,
        names: [named(bindings.get(local).imported, exported)],
        reexport: true,
      })),
  ];
}

function neutralImports(fact, resolve) {
  return importRecords(fact).flatMap(({ specifier, names, reexport = false }) => {
    const target = resolve(specifier, fact.path);
    return target.path === undefined ? [] : [{ from: fact.path, to: target.path, names, reexport }];
  });
}

function exportedAs(fact, definition) {
  return [
    ...(definition.exported ? [definition.isDefault ? 'default' : definition.name] : []),
    ...fact.exports.locals
      .filter(({ local }) => local === definition.name)
      .map(({ exported }) => exported),
  ];
}

function sourceText(target, specifier, importer) {
  if (target.kind === 'file') return `file:${target.path}`;
  if (!specifier.startsWith('.')) return `${target.kind}:${specifier}`;
  return `path:${path.posix.join(path.posix.dirname(importer), specifier)}`;
}

function bindingText(binding, fact, resolve) {
  if (binding.kind === 'local') return `local:${binding.text}`;
  const target = resolve(binding.specifier, fact.path);
  return `${sourceText(target, binding.specifier, fact.path)}#${binding.imported}`;
}

function keyOf(definition, fact, resolve) {
  const free = definition.free.map(
    ({ name, binding }) => `${name}=${bindingText(binding, fact, resolve)}`,
  );
  return hash(`${definition.text}|${free.join(',')}`);
}

function neutralDefinition(definition, fact, resolve) {
  const exportNames = exportedAs(fact, definition);
  return {
    file: fact.path,
    package: fact.packageRoot,
    name: definition.name,
    kind: definition.kind,
    line: definition.line,
    lines: definition.lines,
    exported: exportNames.length > 0,
    exportNames,
    tokens: definition.tokens,
    text: definition.text,
    key: keyOf(definition, fact, resolve),
    size: definition.size,
    literal: definition.literal,
    usedLocally: definition.usedLocally,
    entry: exportNames.some((name) => name === 'default' || HTTP_METHODS.has(name)),
  };
}

export function neutralReuseFacts(facts, resolve) {
  const files = new Set(facts.map(({ path: file }) => file));
  return {
    modules: facts.map(({ path: file }) => ({ file, role: 'production' })),
    packages: [],
    definitions: facts.flatMap((fact) =>
      fact.definitions.map((definition) => neutralDefinition(definition, fact, resolve)),
    ),
    imports: facts
      .flatMap((fact) => neutralImports(fact, resolve))
      .filter(({ to }) => files.has(to)),
  };
}
