import { RULE_IDS } from '../../../../shared/policy.mjs';
import { sharedFactFindings as untypedSharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { directoryOf, goPackages } from '../typed/go-readers.mts';
import type {
  FindingRow,
  GoDefinition,
  GoFacts,
  GoImportFact,
  GoPackages,
  GoUsage,
  InspectReport,
} from '../go-types.mts';

const sharedFactFindings: (
  facts: unknown,
  options: Readonly<Record<string, unknown>>,
) => FindingRow[] = untypedSharedFactFindings;

type EntryReport = Pick<InspectReport, 'files' | 'definitions' | 'usages'>;
type Reexport = GoImportFact & { readonly reexport: true };

const ENTRY_POINTS_TOOL = 'entry-points';
const MAIN = 'main';
const TYPE_KINDS = new Set(['type', 'interface']);
const ALIAS_TOKENS = 5;

function aliasOf({ kind, exported, tokens }: Pick<GoDefinition, 'kind' | 'exported' | 'tokens'>) {
  const [name = '', assign, qualifier = '', dot, target = ''] = tokens;
  return TYPE_KINDS.has(kind) &&
    exported &&
    tokens.length === ALIAS_TOKENS &&
    assign === '=' &&
    dot === '.'
    ? { name, qualifier, target }
    : undefined;
}

function qualifiers(usage: GoUsage | undefined, packages: GoPackages) {
  return new Map<string, string>(
    (usage?.imports ?? []).flatMap(({ path: importPath, name }) => {
      const directory = packages.directoryOfImport(importPath);
      const qualifier = name === '' ? packages.nameOf(directory) : name;
      return directory === undefined || qualifier === undefined ? [] : [[qualifier, directory]];
    }),
  );
}

function isBelow(directory: string, folder: string) {
  return folder !== '' && directory.startsWith(`${folder}/`);
}

function typeFile(report: EntryReport, { directory, name }: { directory: string; name: string }) {
  const production = new Set(report.files.filter(({ test }) => !test).map(({ path }) => path));
  return report.definitions.find(
    (definition) =>
      TYPE_KINDS.has(definition.kind) &&
      definition.name === name &&
      production.has(definition.file) &&
      directoryOf(definition.file) === directory,
  )?.file;
}

function reexportOf(
  definition: GoDefinition,
  {
    report,
    packages,
    usages,
  }: { report: EntryReport; packages: GoPackages; usages: ReadonlyMap<string, GoUsage> },
): Reexport[] {
  const alias = aliasOf(definition);
  const directory =
    alias === undefined
      ? undefined
      : qualifiers(usages.get(definition.file), packages).get(alias.qualifier);
  const to =
    alias !== undefined &&
    directory !== undefined &&
    isBelow(directory, directoryOf(definition.file))
      ? typeFile(report, { directory, name: alias.target })
      : undefined;
  if (to === undefined || alias === undefined) {
    return [];
  }
  const names = [
    alias.name === alias.target
      ? { name: alias.target }
      : { name: alias.target, alias: alias.name },
  ];
  return [{ from: definition.file, to, names, reexport: true }];
}

export function goReexports(report: EntryReport, module: string): Reexport[] {
  const context = {
    report,
    packages: goPackages(report, module),
    usages: new Map(report.usages.map((usage) => [usage.file, usage])),
  };
  const production = new Set(report.files.filter(({ test }) => !test).map(({ path }) => path));
  return report.definitions
    .filter(({ file }) => production.has(file))
    .flatMap((definition) => reexportOf(definition, context));
}

function entryModules(
  report: EntryReport,
  { reexports, module }: { reexports: readonly Reexport[]; module: string },
) {
  const packages = goPackages(report, module);
  return report.files.map(({ path: file, test, package: name }) => {
    const publicNames = reexports
      .filter(({ from }) => from === file)
      .flatMap(({ names }) => names.map(({ name: each, alias }) => alias ?? each));
    return {
      file,
      role: test ? 'test' : 'production',
      entry: false,
      compositionRoot: name === MAIN,
      ...(publicNames.length === 0
        ? {}
        : { publicNames, entryName: packages.importPathOf(directoryOf(file)) }),
    };
  });
}

export function goEntryPointFindings(
  report: EntryReport,
  {
    facts,
    module,
    exceptions = [],
  }: {
    facts: Pick<GoFacts, 'imports'>;
    module: string;
    exceptions?: readonly unknown[] | undefined;
  },
): FindingRow[] {
  const reexports = goReexports(report, module);
  if (reexports.length === 0) {
    return [];
  }
  return sharedFactFindings(
    {
      modules: entryModules(report, { reexports, module }),
      imports: [...facts.imports, ...reexports],
    },
    {
      language: 'go',
      analyzerName: ENTRY_POINTS_TOOL,
      rules: [RULE_IDS.publicAlternativeBypass],
      policy: { exceptions },
    },
  );
}
