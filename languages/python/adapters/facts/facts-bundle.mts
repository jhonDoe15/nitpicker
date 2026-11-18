import path from 'node:path';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { named, referenceTargets } from './facts-references.mts';
import { createResolver } from './facts-resolver.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import type {
  Binding,
  BundleInput,
  Definition,
  FactsBundle,
  FactsContext,
  FactsImport,
  Group,
  ImportRecord,
  LinkTarget,
  ModuleFact,
  ReferenceContext,
  Resolver,
  ScannedFile,
  Site,
} from './typed/facts-types.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';

const MAIN_FILE = '__main__.py';
const ANY_NAME = '*';
const FRAMEWORK_NAMES = new Set(['Command', 'Config', 'Meta', 'Migration']);
const DJANGO_MODULES = new Set([
  'admin.py',
  'apps.py',
  'asgi.py',
  'settings.py',
  'signals.py',
  'urls.py',
  'wsgi.py',
]);
const DJANGO_FOLDERS = ['templatetags', 'management/commands', 'settings', 'migrations'];

function isDjangoConvention(file: string): boolean {
  const directory = `/${path.posix.dirname(file)}/`;
  return (
    DJANGO_MODULES.has(path.posix.basename(file)) ||
    DJANGO_FOLDERS.some((folder) => directory.includes(`/${folder}/`))
  );
}

function moduleImports(statement: FactsImport, resolver: Resolver): LinkTarget[] {
  return statement.aliases.flatMap(({ name, alias }) => {
    const parts = name.split('.');
    const loads = parts.slice(0, -1).map((_, index) => ({
      to: resolver.fileOf(resolver.moduleStem(parts.slice(0, index + 1).join('.'))),
      names: [],
    }));
    const to = resolver.fileOf(resolver.moduleStem(name));
    return [...loads, { to, names: [named(ANY_NAME, alias)] }];
  });
}

function definesName(facts: ScannedFile | undefined, name: string): boolean {
  return facts?.definitions.some((definition) => definition.name === name) ?? false;
}

function fromImports(
  file: string,
  statement: FactsImport,
  { resolver, scanned }: ReferenceContext,
): LinkTarget[] {
  const stem = resolver.baseStem(file, statement);
  if (stem === undefined) {
    return [];
  }
  const target = resolver.fileOf(stem);
  const reexported = new Set(
    (scanned[file]?.exports.reexports ?? [])
      .filter(({ line }) => line === statement.line)
      .map(({ name }) => name),
  );
  return statement.aliases.map(({ name, alias }) => {
    const reexport = reexported.has(alias ?? name);
    const submodule = name === ANY_NAME ? undefined : resolver.fileOf(`${stem}/${name}`);
    if (submodule !== undefined && !definesName(scanned[target ?? ''], name)) {
      return { to: submodule, names: [named(ANY_NAME, alias ?? name)], reexport };
    }
    return { to: target, names: [named(name, alias)], reexport };
  });
}

function mergedStatements(
  entries: readonly LinkTarget[],
  statement: Site,
  { file, role }: { file: string; role: string },
): ImportRecord[] {
  const groups = new Map<string, Group>();
  for (const { to, names, reexport = false } of entries) {
    if (to === undefined) {
      continue;
    }
    const key = `${to}\0${String(reexport)}`;
    const group: Group = groups.get(key) ?? { from: file, to, names: [], reexport, role };
    appendAll(group.names, names);
    groups.set(key, group);
  }
  return [...groups.values()].map((group): ImportRecord => ({
    ...group,
    line: statement.line,
    typeOnly: statement.typeOnly === true,
    ...(statement.conditional ? { conditional: true } : {}),
    ...(statement.local ? { local: true } : {}),
  }));
}

function withoutWildcards(record: ImportRecord): ImportRecord {
  return { ...record, names: record.names.filter(({ name }) => name !== ANY_NAME) };
}

function importFacts(file: string, context: FactsContext): ImportRecord[] {
  const role = context.roleOf(file);
  const written = (context.scanned[file]?.imports ?? []).filter(
    ({ exported }) => exported !== true,
  );
  const statements = written.flatMap((statement) => {
    const entries =
      statement.module === null && statement.level === 0
        ? moduleImports(statement, context.resolver)
        : fromImports(file, statement, context);
    return mergedStatements(entries, statement, { file, role });
  });
  const references = referenceTargets(file, context).flatMap(([reference, targets]) =>
    mergedStatements(
      targets.filter(({ to }) => to !== file),
      reference,
      { file, role },
    ),
  );
  return [
    ...(context.referenceOnly.has(file) ? statements.map(withoutWildcards) : statements),
    ...references.map((record): ImportRecord => ({ ...record, typeOnly: false, reference: true })),
  ];
}

function definitionText({ tag, tokens }: Pick<Definition, 'tag' | 'tokens'>): string {
  return `${tag}|${tokens.join(' ')}`;
}

function bindingText(
  file: string,
  { name: used, binding }: { name: string; binding: Binding },
  context: FactsContext,
): string {
  if (binding.kind === 'local') {
    const local = context.scanned[file]?.definitions.find(({ name }) => name === used);
    return `local:${local === undefined ? '' : definitionText(local)}`;
  }
  const statement = { level: binding.level, module: binding.module };
  const stem =
    binding.kind === 'module'
      ? context.resolver.moduleStem(textOf(binding.module))
      : context.resolver.baseStem(file, statement);
  const source =
    context.resolver.fileOf(stem) ??
    `external:${'.'.repeat(binding.level)}${textOf(binding.module)}`;
  return binding.kind === 'module' ? `module:${source}` : `${source}#${binding.name}`;
}

function definitionFacts(file: string, context: FactsContext): Record<string, unknown>[] {
  if (context.referenceOnly.has(file)) {
    return [];
  }
  const entries = context.entryNames.get(file) ?? new Set<string>();
  const convention = context.isConvention(file);
  const distribution = context.packageOf(file);
  return (context.scanned[file]?.definitions ?? []).map((definition) => {
    const free = definition.free.map((use) => `${use.name}=${bindingText(file, use, context)}`);
    const text = definitionText(definition);
    return {
      file,
      name: definition.name,
      kind: definition.kind,
      line: definition.line,
      lines: definition.lines,
      exported: definition.exported,
      tokens: definition.tokens,
      literal: definition.literal,
      usedLocally: definition.usedLocally,
      text,
      key: hash(`${text}|${free.join(',')}`),
      entry: convention || entries.has(definition.name) || context.isFrameworkName(definition.name),
      ...(distribution === '' ? {} : { package: distribution }),
    };
  });
}

function entryPointNames(
  entryPoints: readonly string[],
  resolver: Resolver,
): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>();
  for (const entryPoint of entryPoints) {
    const [module = '', attribute = ''] = entryPoint.split(':');
    const file = resolver.fileOf(resolver.moduleStem(module));
    if (file !== undefined) {
      names.set(file, new Set([...(names.get(file) ?? []), attribute.split('.')[0] ?? '']));
    }
  }
  return names;
}

function moduleFact(file: string, context: FactsContext): ModuleFact {
  const { scanned, entryNames, referenceOnly, moduleNames } = context;
  return {
    file,
    role: context.roleOf(file),
    entry:
      scanned[file]?.script === true ||
      path.posix.basename(file) === MAIN_FILE ||
      entryNames.has(file) ||
      referenceOnly.has(file) ||
      context.isConvention(file),
    ...(moduleNames.has(file) ? { module: moduleNames.get(file) } : {}),
    qualifiedUses: scanned[file]?.qualifiedUses,
  };
}

function isProductionSource(file: string, context: FactsContext): boolean {
  return !context.referenceOnly.has(file) && context.roleOf(file) !== 'test';
}

function nearDuplicateUnits(file: string, context: FactsContext): Record<string, unknown>[] {
  if (!isProductionSource(file, context)) {
    return [];
  }
  return (context.scanned[file]?.nearDuplicateUnits ?? []).map((unit) => ({ file, ...unit }));
}

function docCommentFacts(file: string, context: FactsContext): Record<string, unknown>[] {
  if (!isProductionSource(file, context)) {
    return [];
  }
  return (context.scanned[file]?.docComments ?? []).map(
    ({ line, name, qualifier, lines, detailed }) => ({
      file,
      line,
      name,
      qualifier,
      lines,
      detailed,
    }),
  );
}

export function factsBundle({
  modules,
  scanned,
  isTest,
  published = false,
  entryPoints = [],
  django = false,
  referenceFiles = [],
  packageOf = () => '',
}: BundleInput): FactsBundle {
  const files = Object.keys(scanned).sort();
  const resolver = createResolver(modules, files);
  function roleOf(file: string): string {
    return isTest(file) ? 'test' : 'production';
  }
  function isConvention(file: string): boolean {
    return django && isDjangoConvention(file);
  }
  function isFrameworkName(name: string): boolean {
    return django && FRAMEWORK_NAMES.has(name);
  }
  const context: FactsContext = {
    resolver,
    scanned,
    roleOf,
    isConvention,
    isFrameworkName,
    packageOf,
    entryNames: entryPointNames(entryPoints, resolver),
    referenceOnly: new Set(referenceFiles),
    moduleNames: new Map(modules.map(({ file, module }): [string, string] => [file, module])),
  };
  return {
    modules: files.map((file) => moduleFact(file, context)),
    packages: [{ root: '', published }],
    definitions: files.flatMap((file) => definitionFacts(file, context)),
    imports: files.flatMap((file) => importFacts(file, context)),
    docComments: files.flatMap((file) => docCommentFacts(file, context)),
    nearDuplicateUnits: files.flatMap((file) => nearDuplicateUnits(file, context)),
  };
}
