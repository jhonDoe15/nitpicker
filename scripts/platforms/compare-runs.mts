import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { requiredFields, requiredText } from '../json/fields.mts';
import { sampleNamed } from './samples.mts';
import { containedPath } from '../../core/fix/common/contained-path.mjs';
import type { NormalizedRun, PlatformRun } from './smoke.mts';

export type ExpectedDifference = {
  readonly platform?: string;
  readonly runtime?: string;
  readonly sample: string;
  readonly analyzer: string;
  readonly findingTools?: readonly string[];
  readonly reason: string;
};

type Part = 'all' | 'change';

type Kind = 'findings' | 'toolErrors';

export type Difference = {
  readonly part: Part;
  readonly kind: Kind;
  readonly key: string;
  readonly sign: '-' | '+';
};

type Comparison = { readonly problems: string[]; readonly notes: string[] };

export const EXPECTED_DIFFERENCES: readonly ExpectedDifference[] = [
  {
    platform: 'win32',
    sample: 'python',
    analyzer: 'mutation',
    findingTools: ['mutmut'],
    reason:
      'mutmut needs `fork`, so Python mutation testing is skipped on native Windows; use WSL.',
  },
];

const UPDATE_DOCS = 'update EXPECTED_DIFFERENCES and docs/compatibility.md';
const PARTS: readonly Part[] = ['all', 'change'];
const KINDS: readonly Kind[] = ['findings', 'toolErrors'];

function changedPaths(sample: string): string[] {
  const { files = {}, append = {} } = sampleNamed(sample).change;
  return [...Object.keys(files), ...Object.keys(append)];
}

function applies(expected: ExpectedDifference, run: PlatformRun): boolean {
  return (
    expected.sample === run.sample &&
    (expected.runtime === undefined || expected.runtime === run.runtime) &&
    (expected.platform === undefined || expected.platform === run.platform)
  );
}

export function expectedDifferences(run: PlatformRun): ExpectedDifference[] {
  return EXPECTED_DIFFERENCES.filter((expected) => applies(expected, run));
}

function label(run: PlatformRun): string {
  return `${run.sample} on ${run.platform} with ${run.runtime}`;
}

export function invariantProblems(run: PlatformRun): string[] {
  const changed = changedPaths(run.sample);
  const caught = run.change.findings.some((key) => {
    const [, , file, , classification] = keyParts(key);
    return classification === 'enforceable' && typeof file === 'string' && changed.includes(file);
  });
  return [
    ...(run.change.exitCode === 1
      ? []
      : [`${label(run)}: the change exited ${String(run.change.exitCode)}, not 1`]),
    ...(caught ? [] : [`${label(run)}: no new enforceable finding on ${changed.join(', ')}`]),
  ];
}

function requiredList(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${what} must be a list`);
  }
  return value;
}

function keyParts(key: string): readonly unknown[] {
  const parts: unknown = JSON.parse(key);
  return requiredList(parts, key);
}

function toolOf(kind: Kind, key: string): unknown {
  return keyParts(key)[kind === 'toolErrors' ? 1 : 0];
}

function differences(reference: PlatformRun, run: PlatformRun): Difference[] {
  return PARTS.flatMap((part) =>
    KINDS.flatMap((kind) => {
      const expected = new Set(reference[part][kind]);
      const actual = new Set(run[part][kind]);
      return [
        ...[...expected]
          .filter((key) => !actual.has(key))
          .map((key): Difference => ({ part, kind, key, sign: '-' })),
        ...[...actual]
          .filter((key) => !expected.has(key))
          .map((key): Difference => ({ part, kind, key, sign: '+' })),
      ];
    }),
  );
}

function describeDifference(run: PlatformRun, { part, sign, key }: Difference): string {
  return `${label(run)}: ${part} ${sign} ${key}`;
}

export function coversDifference(expected: ExpectedDifference, difference: Difference): boolean {
  const tool = toolOf(difference.kind, difference.key);
  return difference.kind === 'toolErrors'
    ? tool === expected.analyzer
    : (expected.findingTools ?? [expected.analyzer]).some((name) => name === tool);
}

function isExpected(expected: readonly ExpectedDifference[], difference: Difference): boolean {
  return expected.some((candidate) => coversDifference(candidate, difference));
}

function exitProblems(
  reference: PlatformRun,
  run: PlatformRun,
  allowed: readonly Difference[],
): string[] {
  return PARTS.filter(
    (part) =>
      reference[part].exitCode !== run[part].exitCode &&
      !allowed.some((difference) => difference.part === part),
  ).map(
    (part) =>
      `${label(run)}: ${part} exited ${String(run[part].exitCode)}, the reference ${String(reference[part].exitCode)}`,
  );
}

export function compareRuns(
  reference: PlatformRun,
  run: PlatformRun,
): { problems: string[]; allowed: string[] } {
  const expected = expectedDifferences(run);
  const found = differences(reference, run);
  const allowed = found.filter((difference) => isExpected(expected, difference));
  const stale = expected
    .filter((candidate) => !found.some((difference) => coversDifference(candidate, difference)))
    .map(
      ({ analyzer }) =>
        `${label(run)}: the expected difference in ${analyzer} no longer occurs; ${UPDATE_DOCS}`,
    );
  return {
    problems: [
      ...invariantProblems(run),
      ...found
        .filter((difference) => !isExpected(expected, difference))
        .map((difference) => describeDifference(run, difference)),
      ...exitProblems(reference, run, allowed),
      ...stale,
    ],
    allowed: allowed.map((difference) => describeDifference(run, difference)),
  };
}

export function referenceProblems(reference: PlatformRun): string[] {
  const expectedExit = sampleNamed(reference.sample).allExitCode;
  return [
    ...invariantProblems(reference),
    ...(reference.all.exitCode === expectedExit
      ? []
      : [
          `${label(reference)}: --all exited ${String(reference.all.exitCode)}, not ${String(expectedExit)}`,
        ]),
    ...PARTS.flatMap((part) =>
      reference[part].toolErrors.map(
        (key) => `${label(reference)}: the reference run has a tool error in ${part}: ${key}`,
      ),
    ),
  ];
}

function toolErrorNotes(run: PlatformRun): string[] {
  return PARTS.flatMap((part) =>
    run[part].toolErrorMessages.map((line) => `tool error in ${label(run)}, ${part}: ${line}`),
  );
}

function stringsOf(fields: Readonly<Record<string, unknown>>, key: string): string[] {
  return requiredList(fields[key], key).map((item) => requiredText(item, key));
}

function exitCodeOf(value: unknown): number | undefined {
  if (value !== undefined && typeof value !== 'number') {
    throw new TypeError('exitCode must be a number when present');
  }
  return value;
}

function normalizedRunOf(value: unknown, part: string): NormalizedRun {
  const fields = requiredFields(value, part);
  return {
    exitCode: exitCodeOf(fields['exitCode']),
    findings: stringsOf(fields, 'findings'),
    toolErrors: stringsOf(fields, 'toolErrors'),
    toolErrorMessages: stringsOf(fields, 'toolErrorMessages'),
  };
}

export function platformRunOf(value: unknown): PlatformRun {
  const fields = requiredFields(value, 'a platform run');
  return {
    sample: requiredText(fields['sample'], 'sample'),
    runtime: requiredText(fields['runtime'], 'runtime'),
    platform: requiredText(fields['platform'], 'platform'),
    all: normalizedRunOf(fields['all'], 'all'),
    change: normalizedRunOf(fields['change'], 'change'),
  };
}

function readRun(file: string): PlatformRun {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return platformRunOf(parsed);
}

function readRuns(directory: string): PlatformRun[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readRun(containedPath(directory, name)));
}

function compareWithReference(reference: PlatformRun, directory: string): Comparison {
  const file = containedPath(directory, `${reference.sample}.json`);
  if (!existsSync(file)) {
    return { problems: [`${directory}: no run of ${reference.sample}`], notes: [] };
  }
  const run = readRun(file);
  const { problems, allowed } = compareRuns(reference, run);
  return {
    problems,
    notes: [...allowed.map((line) => `expected: ${line}`), ...toolErrorNotes(run)],
  };
}

function compareDirectories(
  referenceDirectory: string,
  directories: readonly string[],
): Comparison {
  const references = readRuns(referenceDirectory);
  const comparisons = directories.flatMap((directory) =>
    references.map((reference) => compareWithReference(reference, directory)),
  );
  return {
    problems: [
      ...references.flatMap(referenceProblems),
      ...comparisons.flatMap(({ problems }) => problems),
    ],
    notes: [...references.flatMap(toolErrorNotes), ...comparisons.flatMap(({ notes }) => notes)],
  };
}

function main(args: string[]): void {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { report: { type: 'string', default: 'reports/platforms/comparison.txt' } },
  });
  const [referenceDirectory, ...directories] = positionals;
  if (referenceDirectory === undefined) {
    throw new Error('Name the reference run directory and the directories to compare with it.');
  }
  const { problems, notes } = compareDirectories(referenceDirectory, directories);
  mkdirSync(path.dirname(values.report), { recursive: true });
  const lines = [...notes, ...problems.map((problem) => `problem: ${problem}`)];
  writeFileSync(values.report, `${lines.join('\n')}\n`);
  if (problems.length > 0) {
    throw new Error(`The runs differ from the reference run:\n${problems.join('\n')}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
