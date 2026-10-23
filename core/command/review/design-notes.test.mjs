import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);
const file = (number) => `src/main/note-${String(number).padStart(2, '0')}.ts`;
const note = (number) =>
  finding({
    path: file(number),
    identity: `note-${String(number)}`,
    classification: 'descriptive',
    message: `Review boundary ${String(number)}. Keep the full explanation in the report.`,
  });
const noteLine = (number) =>
  `  fake-quality-analyzer/fixture-rule ${file(number)}:1 Review boundary ${String(number)}.`;
const cases = [
  [0, []],
  [2, ['Design notes for review (not failing): 2 new', noteLine(1), noteLine(2)]],
  [
    12,
    [
      'Design notes for review (not failing): 12 new',
      ...Array.from({ length: 10 }, (_, index) => noteLine(index + 1)),
    ],
  ],
];

function snapshotLines(count, notes) {
  return [
    'Nitpicker quality snapshot',
    'Status: clean',
    'Enforceable findings: 0',
    `Descriptive findings: ${String(count)}`,
    'Tool errors: 0',
    '',
    'Per-tool counts:',
    `fake-quality-analyzer: total=${String(count)} enforceable=0 descriptive=${String(count)}`,
    ...notes,
    '',
  ];
}

function diffLines(repository, diagnosticsPath, notes) {
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

describe.each(['diff', 'snapshot'])('design review notes in %s mode', (mode) => {
  it.each(cases)('shows a bounded, non-failing summary for %i findings', (count, expectedNotes) => {
    const repository = createRepository({ 'quality-policy.json': policy() });
    const numbers = Array.from({ length: count }, (_, index) => index + 1);
    writeFiles(
      repository.root,
      Object.fromEntries(numbers.map((number) => [file(number), findingLine(note(number))])),
    );
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
      ...expectedNotes,
      ...(count === 12 ? [`  … 2 more; see ${diagnosticsPath}`] : []),
    ];
    const expected =
      mode === 'diff'
        ? diffLines(repository, diagnosticsPath, notes)
        : snapshotLines(count, [...(count === 0 ? [] : ['']), ...notes]);
    expect(exitCode).toBe(0);
    expect(stripVTControlCharacters(output.stdoutText)).toBe(expected.join('\n'));
    expect(output.stderrText).toBe('');
    const reportName = mode === 'diff' ? 'new-findings.json' : 'findings.json';
    const findings = JSON.parse(readFileSync(path.join(outputRoot, reportName), 'utf8'));
    expect(findings.map(({ path: source }) => source)).toEqual(numbers.map(file));
    expect(findings.map(({ message }) => message)).toEqual(
      numbers.map((number) => note(number).message),
    );
    const textFindings = readFileSync(diagnosticsPath, 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('fake-quality-analyzer/fixture-rule '));
    expect(textFindings).toEqual(
      numbers.map(
        (number) => `fake-quality-analyzer/fixture-rule ${file(number)}:1 ${note(number).message}`,
      ),
    );
  });
});
