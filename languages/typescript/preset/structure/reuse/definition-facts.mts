import path from 'node:path';
import { hash as hashText } from '../../../../../shared/rules/finding-helpers.mjs';
import { persistenceOfModule } from './persistence-modules.mts';
import type {
  ModuleResolution,
  NeutralDefinition,
  NeutralFacts,
  NeutralImport,
  NeutralModule,
  NeutralName,
  Resolve,
  ReuseFact,
} from './typed/reuse-types.mts';
import type { Binding, DefinitionFact } from './typed/syntax-types.mts';

const hash: (value: string) => string = hashText;

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function named(name: string, alias?: string): NeutralName {
  return alias === undefined || alias === name ? { name } : { name, alias };
}

type ImportRecord = {
  readonly specifier: string;
  readonly names: readonly NeutralName[];
  readonly reexport?: true;
};

function importRecords(fact: ReuseFact): ImportRecord[] {
  const bindings = new Map(
    fact.imports.flatMap(({ specifier, named: names }) =>
      names.map(({ local, imported }) => [local, { specifier, imported }] as const),
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
    ...fact.exports.locals.flatMap(({ local, exported }) => {
      const binding = bindings.get(local);
      return binding === undefined
        ? []
        : [
            {
              specifier: binding.specifier,
              names: [named(binding.imported, exported)],
              reexport: true as const,
            },
          ];
    }),
  ];
}

function neutralImports(fact: ReuseFact, resolve: Resolve): NeutralImport[] {
  return importRecords(fact).flatMap(({ specifier, names, reexport = false }) => {
    const target = resolve(specifier, fact.path);
    return target.path === undefined ? [] : [{ from: fact.path, to: target.path, names, reexport }];
  });
}

function exportedAs(fact: ReuseFact, definition: DefinitionFact): string[] {
  return [
    ...(definition.exported ? [definition.isDefault ? 'default' : definition.name] : []),
    ...fact.exports.locals
      .filter(({ local }) => local === definition.name)
      .map(({ exported }) => exported),
  ];
}

export function importSourceText(
  target: ModuleResolution,
  specifier: string,
  importer: string,
): string {
  if (target.kind === 'file') {
    return `file:${String(target.path)}`;
  }
  if (!specifier.startsWith('.')) {
    return `${target.kind}:${specifier}`;
  }
  return `path:${path.posix.join(path.posix.dirname(importer), specifier)}`;
}

function bindingText(binding: Binding, fact: ReuseFact, resolve: Resolve): string {
  if (binding.kind === 'local') return `local:${binding.text}`;
  const target = resolve(binding.specifier, fact.path);
  return `${importSourceText(target, binding.specifier, fact.path)}#${binding.imported}`;
}

function keyOf(definition: DefinitionFact, fact: ReuseFact, resolve: Resolve): string {
  const free = definition.free.map(
    ({ name, binding }) => `${name}=${bindingText(binding, fact, resolve)}`,
  );
  return hash(`${definition.text}|${free.join(',')}`);
}

function neutralDefinition(
  definition: DefinitionFact,
  fact: ReuseFact,
  resolve: Resolve,
): NeutralDefinition {
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
    untypedTokens: definition.untypedTokens,
    text: definition.text,
    key: keyOf(definition, fact, resolve),
    size: definition.size,
    literal: definition.literal,
    usedLocally: definition.usedLocally,
    entry: exportNames.some((name) => name === 'default' || HTTP_METHODS.has(name)),
  };
}

function moduleFact(fact: ReuseFact): NeutralModule {
  const persistence = persistenceOfModule(fact);
  return persistence === undefined
    ? { file: fact.path, role: 'production' }
    : { file: fact.path, role: 'production', persistence };
}

export function neutralReuseFacts(facts: readonly ReuseFact[], resolve: Resolve): NeutralFacts {
  const files = new Set(facts.map(({ path: file }) => file));
  return {
    modules: facts.map((fact) => moduleFact(fact)),
    packages: [],
    definitions: facts.flatMap((fact) =>
      fact.definitions.map((definition) => neutralDefinition(definition, fact, resolve)),
    ),
    imports: facts
      .flatMap((fact) => neutralImports(fact, resolve))
      .filter(({ to }) => files.has(to)),
    nearDuplicateUnits: facts.flatMap((fact) =>
      fact.nearDuplicateUnits.map(({ file, name, start, end, tokens, final, tree }) => ({
        file,
        name,
        start,
        end,
        tokens,
        final,
        tree,
      })),
    ),
  };
}
