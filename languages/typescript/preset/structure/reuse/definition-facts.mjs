import path from 'node:path';
import { hash } from '../../../../../shared/rules/finding-helpers.mjs';

function addNames(usage, filePath, names) {
  const used = usage.get(filePath) ?? new Set();
  usage.set(filePath, used);
  for (const name of names) used.add(name);
}

function importUses(fact) {
  return [
    ...fact.imports.map((declaration) => ({
      specifier: declaration.specifier,
      names: [
        ...(declaration.defaultName === undefined ? [] : ['default']),
        ...(declaration.namespaceName === undefined ? [] : ['*']),
        ...declaration.named.map(({ imported }) => imported),
      ],
    })),
    ...fact.dynamicImports.map((specifier) => ({ specifier, names: ['*'] })),
    ...fact.exports.namespaces.map(({ specifier }) => ({ specifier, names: ['*'] })),
    ...fact.exports.reexports.map(({ specifier, star, names }) => ({
      specifier,
      names: star ? ['*'] : names.map(({ imported }) => imported),
    })),
  ];
}

function importedNames(facts, resolve) {
  const usage = new Map();
  const uses = facts.flatMap((fact) =>
    importUses(fact).map((use) => ({
      names: use.names,
      from: fact.path,
      target: resolve(use.specifier, fact.path),
    })),
  );
  for (const { names, from, target } of uses) {
    if (target.path !== undefined && target.path !== from) addNames(usage, target.path, names);
  }
  return usage;
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

export function resolvedDefinitions(facts, resolve) {
  const imported = importedNames(facts, resolve);
  return facts.map((fact) => {
    const names = imported.get(fact.path) ?? new Set();
    return {
      ...fact,
      definitions: fact.definitions.map((definition) => {
        const exportNames = exportedAs(fact, definition);
        return {
          ...definition,
          exported: exportNames.length > 0,
          key: keyOf(definition, fact, resolve),
          used:
            definition.usedLocally || names.has('*') || exportNames.some((name) => names.has(name)),
        };
      }),
    };
  });
}
