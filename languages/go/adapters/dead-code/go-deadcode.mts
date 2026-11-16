import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildFlags, readVetFindings, VET_REPORT } from '../build/go-vet.mts';
import { run } from '../execution/go-process.mts';
import { toolCommand } from '../execution/go-tools.mts';
import { diagnosticFindings } from '../build/diagnostics.mts';
import { directoryOf, goPackages } from '../facts/go-packages.mts';
import { readInspect } from '../structure/go-inspect.mts';
import {
  fieldOf,
  listOf,
  numberOr,
  parseJson,
  textOf,
} from '../../../../shared/values/readers.mts';
import type { FindingRow, GoContext, GoFacts, GoPackages, InspectReport } from '../go-types.mts';

type Entry = { file: string; line: number; column: number; name: string };
type Filter = {
  packages: GoPackages;
  constrained: ReadonlySet<string>;
  referenced: ReadonlySet<string>;
  reported: ReadonlySet<string>;
  entries: ReadonlySet<string>;
  unusedAt: ReadonlySet<string>;
};
type Options = {
  report: InspectReport;
  module: string;
  facts: GoFacts;
  testOnly: readonly FindingRow[];
  unused?: readonly FindingRow[] | undefined;
};

const DEADCODE_REPORT = 'deadcode.json';
const DEADCODE_TOOL = 'deadcode';
const UNREACHABLE_RULE = 'unreachable-func';
const COMPILE_RULE = 'compile-error';

function writeReport(context: GoContext, packages: unknown) {
  writeFileSync(path.join(context.reportRoot, DEADCODE_REPORT), JSON.stringify(packages));
}

function compiles(context: GoContext) {
  return (
    existsSync(path.join(context.reportRoot, VET_REPORT)) &&
    readVetFindings(context).every(({ rule }) => rule !== COMPILE_RULE)
  );
}

export function deadcode(context: GoContext): void {
  const report = readInspect(context.reportRoot);
  if (goPackages(report, context.module).mains.length === 0 || !compiles(context)) {
    writeReport(context, []);
    return;
  }
  const command = [
    ...toolCommand(context, 'deadcode'),
    '-json',
    ...buildFlags(context.settings),
    './...',
  ];
  const result = run(context, command, { rule: 'go-deadcode-failed' });
  writeReport(context, parseJson((result.stdout ?? '').trim() || '[]') ?? []);
}

function lastName(name: string) {
  return name.split('.').at(-1);
}

function isExported(name: string) {
  return /^\p{Lu}/u.test(lastName(name) ?? '');
}

function constrainedReferences(report: InspectReport, facts: GoFacts) {
  const constrained = new Set(
    report.files.filter(({ constrained: limited }) => limited).map(({ path: file }) => file),
  );
  return {
    constrained,
    referenced: new Set(
      facts.imports
        .filter(({ from }) => constrained.has(from))
        .flatMap(({ to, names }) => names.map(({ name }) => `${to}\0${name}`)),
    ),
  };
}

function entryPoints(report: InspectReport) {
  return new Set(
    report.definitions.filter(({ entry }) => entry).map(({ file, name }) => `${file}\0${name}`),
  );
}

function isDropped(
  entry: Entry,
  { packages, constrained, referenced, reported, entries, unusedAt }: Filter,
) {
  const { file, name, line } = entry;
  const key = `${file}\0${name}`;
  return (
    (packages.isPublished(directoryOf(file)) && isExported(name)) ||
    constrained.has(file) ||
    unusedAt.has(`${file}\0${String(line)}`) ||
    [referenced, reported, entries].some((keys) => keys.has(key))
  );
}

function unreachableMessage(name: string) {
  return `${name} is never reached from a main package of this module (deadcode; calls from tests do not count). Delete it, or call it from production code.`;
}

function deadcodeEntries(packages: unknown): Entry[] {
  return listOf(packages).flatMap((entry) =>
    listOf(fieldOf(entry, 'Funcs')).map((func) => {
      const position = fieldOf(func, 'Position');
      return {
        file: textOf(fieldOf(position, 'File')).split(path.sep).join('/'),
        line: numberOr(fieldOf(position, 'Line'), 0),
        column: numberOr(fieldOf(position, 'Col'), 0),
        name: textOf(fieldOf(func, 'Name')),
      };
    }),
  );
}

export function unreachableFindings(
  projectRoot: string,
  deadcodePackages: unknown,
  { report, module, facts, testOnly, unused = [] }: Options,
): FindingRow[] {
  const filter: Filter = {
    packages: goPackages(report, module),
    ...constrainedReferences(report, facts),
    reported: new Set(testOnly.map(({ path: file, symbol }) => `${file}\0${textOf(symbol)}`)),
    entries: entryPoints(report),
    unusedAt: new Set(
      unused.map(({ path: file, location }) => `${file}\0${textOf(fieldOf(location, 'line'))}`),
    ),
  };
  return diagnosticFindings(
    projectRoot,
    deadcodeEntries(deadcodePackages)
      .filter((entry) => !isDropped(entry, filter))
      .map(({ file, line, column, name }) => ({
        tool: DEADCODE_TOOL,
        rule: UNREACHABLE_RULE,
        file,
        line,
        column,
        message: unreachableMessage(name),
      })),
  );
}

export function readDeadcodeFindings(
  context: GoContext,
  { facts, testOnly, unused }: Pick<Options, 'facts' | 'testOnly' | 'unused'>,
): FindingRow[] {
  return unreachableFindings(
    context.projectRoot,
    parseJson(readFileSync(path.join(context.reportRoot, DEADCODE_REPORT), 'utf8')),
    { report: readInspect(context.reportRoot), module: context.module, facts, testOnly, unused },
  );
}
