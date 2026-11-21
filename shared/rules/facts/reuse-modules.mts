import { hash } from '../finding-parts.mts';
import type {
  FactDefinition,
  FactImport,
  FactModule,
  FactPackage,
  Facts,
} from './typed/fact-types.mts';
import type { ReuseDefinition, ReuseModule } from './typed/reuse-module-types.mts';

type RoleModule = Pick<FactModule, 'file' | 'role'>;

export function packageLookup(
  packages: readonly FactPackage[] = [],
): (file: string) => FactPackage | undefined {
  const ordered = packages.toSorted((left, right) => right.root.length - left.root.length);
  return (file) =>
    ordered.find(({ root }) => root === '' || file === root || file.startsWith(`${root}/`));
}

export function roleLookup(modules: readonly RoleModule[] = []): (file: string) => string {
  const roles = new Map(modules.map(({ file, role }) => [file, role]));
  return (file) => roles.get(file) ?? 'production';
}

export function withImportRoles(facts: Facts): Facts {
  if (facts.imports === undefined) {
    return facts;
  }
  const roleOf = roleLookup(facts.modules);
  return {
    ...facts,
    imports: facts.imports.map((record) => ({ ...record, role: roleOf(record.from) })),
  };
}

function namesImportedFrom(imports: readonly FactImport[]): Map<string, Set<string>> {
  const usage = new Map<string, Set<string>>();
  const counted = imports.filter(({ from, to, role }) => role !== 'test' && from !== to);
  for (const { to, names } of counted) {
    const used = usage.get(to) ?? new Set<string>();
    usage.set(to, used);
    for (const { name } of names) {
      used.add(name);
    }
  }
  return usage;
}

function normalizedDefinition(
  definition: FactDefinition,
  imported: ReadonlySet<string>,
): ReuseDefinition {
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

export function reuseModules({
  definitions = [],
  imports = [],
  modules = [],
  packages = [],
}: {
  readonly definitions?: readonly FactDefinition[];
  readonly imports?: readonly FactImport[];
  readonly modules?: readonly RoleModule[];
  readonly packages?: readonly FactPackage[];
}): ReuseModule[] {
  const roleOf = roleLookup(modules);
  const packageOf = packageLookup(packages);
  const imported = namesImportedFrom(imports);
  const byFile = new Map<string, ReuseModule>();
  for (const definition of definitions.filter(({ file }) => roleOf(file) !== 'test')) {
    const module = byFile.get(definition.file) ?? {
      path: definition.file,
      packageRoot: definition.package ?? packageOf(definition.file)?.root ?? '',
      definitions: [],
    };
    module.definitions.push(
      normalizedDefinition(definition, imported.get(definition.file) ?? new Set()),
    );
    byFile.set(definition.file, module);
  }
  return [...byFile.values()];
}
