import { hash } from '../finding-helpers.mjs';

export function packageLookup(packages = []) {
  const ordered = packages.toSorted((left, right) => right.root.length - left.root.length);
  return (file) =>
    ordered.find(({ root }) => root === '' || file === root || file.startsWith(`${root}/`));
}

export function roleLookup(modules = []) {
  const roles = new Map(modules.map(({ file, role }) => [file, role]));
  return (file) => roles.get(file) ?? 'production';
}

export function withImportRoles(facts) {
  if (facts.imports === undefined) {
    return facts;
  }
  const roleOf = roleLookup(facts.modules);
  return {
    ...facts,
    imports: facts.imports.map((record) => ({ ...record, role: roleOf(record.from) })),
  };
}

function namesImportedFrom(imports) {
  const usage = new Map();
  const counted = imports.filter(({ from, to, role }) => role !== 'test' && from !== to);
  for (const { to, names } of counted) {
    const used = usage.get(to) ?? new Set();
    usage.set(to, used);
    for (const { name } of names) {
      used.add(name);
    }
  }
  return usage;
}

function normalizedDefinition(definition, imported) {
  const exportNames = definition.exportNames ?? (definition.exported ? [definition.name] : []);
  const text = definition.text ?? definition.tokens.join(' ');
  return {
    ...definition,
    exportNames,
    exported: exportNames.length > 0,
    text,
    key: definition.key ?? hash(text),
    size: definition.size ?? definition.tokens.length,
    lines: definition.lines ?? 1,
    literal: definition.literal ?? false,
    entry: definition.entry ?? false,
    used:
      definition.usedLocally === true ||
      imported.has('*') ||
      exportNames.some((name) => imported.has(name)),
  };
}

export function reuseModules({ definitions = [], imports = [], modules = [], packages = [] }) {
  const roleOf = roleLookup(modules);
  const packageOf = packageLookup(packages);
  const imported = namesImportedFrom(imports);
  const byFile = new Map();
  for (const definition of definitions.filter(({ file }) => roleOf(file) !== 'test')) {
    const packageRoot = packageOf(definition.file)?.root ?? '';
    const module = byFile.get(definition.file) ?? {
      path: definition.file,
      packageRoot,
      siblingRoot: definition.package ?? packageRoot,
      definitions: [],
    };
    module.definitions.push(
      normalizedDefinition(definition, imported.get(definition.file) ?? new Set()),
    );
    byFile.set(definition.file, module);
  }
  return [...byFile.values()];
}
