import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SAMPLES } from './samples.mjs';

export const EXPECTED_DIFFERENCES = [
  {
    runtime: 'deno',
    sample: 'typescript',
    tools: ['typescript-typecheck'],
    reason:
      'The TypeScript 7 engine cannot reach `tsgo` through its sync pipe channel (#476); set `tools.typescript.engine` to `"project"`.',
  },
  {
    platform: 'win32',
    sample: 'python',
    tools: ['mutation'],
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

export function compareRuns(reference, run) {
  const expected = expectedDifferences(run);
  const allowedTools = new Set(expected.flatMap(({ tools }) => tools));
  const found = differences(reference, run);
  const isAllowed = (difference) => allowedTools.has(toolOf(difference.kind, difference.key));
  const describe = ({ part, sign, key }) => `${label(run)}: ${part} ${sign} ${key}`;
  const exitProblems = PARTS.filter(
    (part) => reference[part].exitCode !== run[part].exitCode && !found.some(isAllowed),
  ).map(
    (part) =>
      `${label(run)}: ${part} exited ${String(run[part].exitCode)}, the reference ${String(reference[part].exitCode)}`,
  );
  const stale = expected
    .filter(
      ({ tools }) =>
        !found.some((difference) => tools.includes(toolOf(difference.kind, difference.key))),
    )
    .map(
      ({ tools }) =>
        `${label(run)}: the expected difference in ${tools.join(', ')} no longer occurs; update EXPECTED_DIFFERENCES and docs/compatibility.md`,
    );
  return {
    problems: [
      ...invariantProblems(run),
      ...found.filter((difference) => !isAllowed(difference)).map(describe),
      ...exitProblems,
      ...stale,
    ],
    allowed: found.filter(isAllowed).map(describe),
  };
}

function readRuns(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(path.join(directory, name), 'utf8')));
}

function main([referenceDirectory, ...directories]) {
  const references = readRuns(referenceDirectory);
  const problems = references.flatMap(invariantProblems);
  for (const directory of directories) {
    for (const reference of references) {
      const file = path.join(directory, `${reference.sample}.json`);
      if (!existsSync(file)) {
        problems.push(`${directory}: no run of ${reference.sample}`);
        continue;
      }
      const run = JSON.parse(readFileSync(file, 'utf8'));
      const result = compareRuns(reference, run);
      for (const line of result.allowed) process.stdout.write(`expected: ${line}\n`);
      for (const line of run.all.toolErrorMessages) process.stdout.write(`tool error: ${line}\n`);
      problems.push(...result.problems);
    }
  }
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
