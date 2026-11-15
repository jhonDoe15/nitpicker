import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mts';
import type { FixtureRepository } from '../test-support/fixture-types.mts';
import { fieldOf, listOf, parseJson, textOf } from '../../../shared/values/readers.mts';

type Mode = 'diff' | 'snapshot';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);
const file = (number: number) => `src/main/note-${String(number).padStart(2, '0')}.ts`;
const note = (number: number) =>
  finding({
    path: file(number),
    identity: `note-${String(number)}`,
    classification: 'descriptive',
    message: `Review boundary ${String(number)}. Keep the full explanation in the report.`,
  });
const messageOf = (number: number) => textOf(note(number)['message']);
const noteLine = (number: number) =>
  `  fake-quality-analyzer/fixture-rule ${file(number)}:1 Review boundary ${String(number)}.`;
const cases: [number, string[]][] = [
  [0, []],
  [2, [noteLine(1), noteLine(2)]],
  [12, Array.from({ length: 10 }, (_, index) => noteLine(index + 1))],
];
const SCOPES: Readonly<Record<Mode, string>> = { diff: 'new', snapshot: 'in the snapshot' };

function snapshotLines(count: number, notes: readonly string[], diagnosticsPath: string) {
  return [
    '',
    'Quality snapshot summary',
    '✓ No enforceable findings',
    ...notes,
    'By analyzer:',
    count === 0
      ? '  1 analyzer ran clean'
      : `  fake-quality-analyzer: 0 enforceable, ${String(count)} descriptive`,
    `Full diagnostics: ${diagnosticsPath}`,
    '',
  ];
}

function diffLines(
  repository: FixtureRepository,
  diagnosticsPath: string,
  notes: readonly string[],
) {
  return [
    `Base: ${repository.baseRef} (argument)`,
    '',
    'Quality gate summary',
    '✓ No new enforceable violations',
    ...notes,
    `Full diagnostics: ${diagnosticsPath}`,
    '',
  ];
}

describe.each<Mode>(['diff', 'snapshot'])('design review notes in %s mode', (mode) => {
  it.each(cases)('shows a bounded, non-failing summary for %i findings', (count, expectedNotes) => {
    const repository = createRepository({ 'quality-policy.json': policy() });
    const numbers = Array.from({ length: count }, (_, index) => index + 1);
    writeFiles(repository.root, {
      'src/main/clean.ts': 'export const clean = true;\n',
      ...Object.fromEntries(numbers.map((number) => [file(number), findingLine(note(number))])),
    });
    const outputRoot = makeOutputRoot();
    const diagnosticsPath = path.join(outputRoot, 'report.txt');
    const output = captureOutput();
    const args = mode === 'diff' ? ['--base', repository.baseRef] : ['--all'];
    const exitCode = runCli({
      arguments_: [...args, '--output', outputRoot],
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      snapshotAnalyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });
    const notes = [
      ...(count === 0
        ? []
        : [`Design notes for review (not failing): ${String(count)} ${SCOPES[mode]}`]),
      ...expectedNotes,
      ...(count === 12 ? [`  … 2 more; see ${diagnosticsPath}`] : []),
    ];
    const expected =
      mode === 'diff'
        ? diffLines(repository, diagnosticsPath, notes)
        : snapshotLines(count, notes, diagnosticsPath);
    expect(exitCode).toBe(0);
    expect(stripVTControlCharacters(output.stdoutText)).toBe(expected.join('\n'));
    expect(output.stderrText).toBe('');
    const reportName = mode === 'diff' ? 'new-findings.json' : 'findings.json';
    const findings = listOf(parseJson(readFileSync(path.join(outputRoot, reportName), 'utf8')));
    expect(findings.map((entry) => fieldOf(entry, 'path'))).toEqual(numbers.map(file));
    expect(findings.map((entry) => fieldOf(entry, 'message'))).toEqual(
      numbers.map((number) => messageOf(number)),
    );
    const textFindings = readFileSync(diagnosticsPath, 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('fake-quality-analyzer/fixture-rule '));
    expect(textFindings).toEqual(
      numbers.map(
        (number) => `fake-quality-analyzer/fixture-rule ${file(number)}:1 ${messageOf(number)}`,
      ),
    );
  });
});
