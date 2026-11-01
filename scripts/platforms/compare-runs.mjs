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
import { inside, SAMPLES } from './samples.mjs';

export const EXPECTED_DIFFERENCES = [
  {
    platform: 'win32',
    sample: 'python',
    analyzer: 'mutation',
    findingTools: ['mutmut'],
    reason:
      'mutmut needs `fork`, so Python mutation testing is skipped on native Windows; use WSL.',
  },
];

const PARTS = ['all', 'change'];

function changedPaths(sample) {
  const { files = {}, append = {} } = SAMPLES[sample].change;
  return [...Object.keys(files), ...Object.keys(append)];
}

function applies(expected, run) {
  return (
    expected.sample === run.sample &&
    (expected.runtime === undefined || expected.runtime === run.runtime) &&
    (expected.platform === undefined || expected.platform === run.platform)
  );
}

export function expectedDifferences(run) {
  return EXPECTED_DIFFERENCES.filter((expected) => applies(expected, run));
}

function label(run) {
  return `${run.sample} on ${run.platform} with ${run.runtime}`;
}

export function invariantProblems(run) {
  const changed = changedPaths(run.sample);
  const caught = run.change.findings.some((key) => {
    const [, , file, , classification] = JSON.parse(key);
    return classification === 'enforceable' && changed.includes(file);
  });
  return [
    ...(run.change.exitCode === 1
      ? []
      : [`${label(run)}: the change exited ${String(run.change.exitCode)}, not 1`]),
    ...(caught ? [] : [`${label(run)}: no new enforceable finding on ${changed.join(', ')}`]),
  ];
}

function toolOf(kind, key) {
  return JSON.parse(key)[kind === 'toolErrors' ? 1 : 0];
}

function differences(reference, run) {
  return PARTS.flatMap((part) =>
    ['findings', 'toolErrors'].flatMap((kind) => {
      const expected = new Set(reference[part][kind]);
      const actual = new Set(run[part][kind]);
      return [
        ...[...expected]
          .filter((key) => !actual.has(key))
          .map((key) => ({ part, kind, key, sign: '-' })),
        ...[...actual]
          .filter((key) => !expected.has(key))
          .map((key) => ({ part, kind, key, sign: '+' })),
      ];
    }),
  );
}

function describeDifference(run, { part, sign, key }) {
  return `${label(run)}: ${part} ${sign} ${key}`;
}

export function coversDifference(expected, difference) {
  const tool = toolOf(difference.kind, difference.key);
  return difference.kind === 'toolErrors'
    ? tool === expected.analyzer
    : (expected.findingTools ?? [expected.analyzer]).includes(tool);
}

function isExpected(expected, difference) {
  return expected.some((candidate) => coversDifference(candidate, difference));
}

function exitProblems(reference, run, allowed) {
  return PARTS.filter(
    (part) =>
      reference[part].exitCode !== run[part].exitCode &&
      !allowed.some((difference) => difference.part === part),
  ).map(
    (part) =>
      `${label(run)}: ${part} exited ${String(run[part].exitCode)}, the reference ${String(reference[part].exitCode)}`,
  );
}

export function compareRuns(reference, run) {
  const expected = expectedDifferences(run);
  const found = differences(reference, run);
  const allowed = found.filter((difference) => isExpected(expected, difference));
  const stale = expected
    .filter((candidate) => !found.some((difference) => coversDifference(candidate, difference)))
    .map(
      ({ analyzer }) =>
        `${label(run)}: the expected difference in ${analyzer} no longer occurs; update EXPECTED_DIFFERENCES and docs/compatibility.md`,
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

export function referenceProblems(reference) {
  const expectedExit = SAMPLES[reference.sample].allExitCode;
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

function toolErrorNotes(run) {
  return PARTS.flatMap((part) =>
    run[part].toolErrorMessages.map((line) => `tool error in ${label(run)}, ${part}: ${line}`),
  );
}

function readRuns(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(inside(directory, name), 'utf8')));
}

function compareWithReference(reference, directory) {
  const file = inside(directory, `${reference.sample}.json`);
  if (!existsSync(file)) {
    return { problems: [`${directory}: no run of ${reference.sample}`], notes: [] };
  }
  const run = JSON.parse(readFileSync(file, 'utf8'));
  const { problems, allowed } = compareRuns(reference, run);
  return {
    problems,
    notes: [...allowed.map((line) => `expected: ${line}`), ...toolErrorNotes(run)],
  };
}

function compareDirectories(referenceDirectory, directories) {
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

function main(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { report: { type: 'string', default: 'reports/platforms/comparison.txt' } },
  });
  const [referenceDirectory, ...directories] = positionals;
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
