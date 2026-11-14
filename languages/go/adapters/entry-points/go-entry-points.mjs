import { RULE_IDS } from '../../../../shared/policy.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { directoryOf, goPackages } from '../facts/go-packages.mjs';

const ENTRY_POINTS_TOOL = 'entry-points';
const MAIN = 'main';
const TYPE_KINDS = new Set(['type', 'interface']);
const ALIAS_TOKENS = 5;

function aliasOf({ kind, exported, tokens }) {
  const [name, assign, qualifier, dot, target] = tokens;
  return TYPE_KINDS.has(kind) &&
    exported &&
    tokens.length === ALIAS_TOKENS &&
    assign === '=' &&
    dot === '.'
    ? { name, qualifier, target }
    : undefined;
}

function qualifiers(usage, packages) {
  return new Map(
    (usage?.imports ?? []).flatMap(({ path: importPath, name }) => {
      const directory = packages.directoryOfImport(importPath);
      const qualifier = name === '' ? packages.nameOf(directory) : name;
      return directory === undefined || qualifier === undefined ? [] : [[qualifier, directory]];
    }),
  );
}

function isBelow(directory, folder) {
  return folder !== '' && directory.startsWith(`${folder}/`);
}

function typeFile(report, { directory, name }) {
  const production = new Set(report.files.filter(({ test }) => !test).map(({ path }) => path));
  return report.definitions.find(
    (definition) =>
      TYPE_KINDS.has(definition.kind) &&
      definition.name === name &&
      production.has(definition.file) &&
      directoryOf(definition.file) === directory,
  )?.file;
}

function reexportOf(definition, { report, packages, usages }) {
  const alias = aliasOf(definition);
  const directory =
    alias === undefined
      ? undefined
      : qualifiers(usages.get(definition.file), packages).get(alias.qualifier);
  const to =
    directory !== undefined && isBelow(directory, directoryOf(definition.file))
      ? typeFile(report, { directory, name: alias.target })
      : undefined;
  if (to === undefined) {
    return [];
  }
  const names = [
    alias.name === alias.target
      ? { name: alias.target }
      : { name: alias.target, alias: alias.name },
  ];
  return [{ from: definition.file, to, names, reexport: true }];
}

export function goReexports(report, module) {
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

function entryModules(report, { reexports, module }) {
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

export function goEntryPointFindings(report, { facts, module, exceptions = [] }) {
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
