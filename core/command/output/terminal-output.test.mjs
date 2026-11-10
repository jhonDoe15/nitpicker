import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { exactText } from '../../diff/reporting/test-support/output-expectations.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mjs';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

const ESCAPE = '\u001B';
const RED = '\u001B[31m';
const OUTPUT_ROOT = /\/tmp\/nitpicker-cli-output-[A-Za-z0-9]{6}\/reports/u;

function colouredCrash() {
  return {
    ...fakeAnalyzer('coloured-crash'),
    createInvocation({ policyRoot }) {
      return {
        command: process.execPath,
        args: ['-e', `process.stderr.write('${RED}boom\\u001b[0m'); process.exit(2)`],
        cwd: policyRoot,
      };
    },
  };
}

function runWith({ terminal = false, environment = {}, analyzers, outputRoot } = {}) {
  const repository = createRepository({ 'quality-policy.json': policy() });
  writeFiles(repository.root, {
    'src/main/flagged.ts': findingLine(
      finding({ message: `${RED}Expected${ESCAPE}[0m 1 to be 2` }),
    ),
  });
  const output = captureOutput({ terminal });
  const reports = outputRoot ?? makeOutputRoot();
  const exitCode = runCli({
    arguments_: ['--base', repository.baseRef, '--output', reports],
    environment,
    currentProjectRoot: repository.root,
    analyzers: analyzers ?? [fakeAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
    runTasks: undefined,
  });
  return { exitCode, stdout: output.stdoutText, reports, baseRef: repository.baseRef };
}

function plainSummary(baseRef, reportPath = OUTPUT_ROOT) {
  return exactText`Base: ${baseRef} (argument)

Quality gate summary
✖ 1 new enforceable violation
  fake-quality-analyzer/fixture-rule: Expected 1 to be 2
    src/main/flagged.ts:1:4
Full diagnostics: ${reportPath}/report.txt
`;
}

describe('console colour', () => {
  it.each([
    ['a terminal', { terminal: true }],
    ['a pipe with FORCE_COLOR', { environment: { FORCE_COLOR: '1' } }],
  ])('colours the summary on %s', (_name, options) => {
    const { exitCode, stdout, baseRef } = runWith(options);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual(
      expect.stringMatching(exactText`Base: ${baseRef} (argument)

\u001B[1m\u001B[31mQuality gate summary\u001B[0m
\u001B[1m\u001B[31m✖ 1 new enforceable violation\u001B[0m
  \u001B[33mfake-quality-analyzer/fixture-rule\u001B[0m: Expected 1 to be 2
    src/main/flagged.ts:1:4
\u001B[2mFull diagnostics: ${OUTPUT_ROOT}/report.txt\u001B[0m
`),
    );
  });

  it.each([
    ['a pipe', {}],
    ['a terminal with NO_COLOR', { terminal: true, environment: { NO_COLOR: '1' } }],
    ['a terminal with FORCE_COLOR=0', { terminal: true, environment: { FORCE_COLOR: '0' } }],
  ])('writes plain text to %s', (_name, options) => {
    const { exitCode, stdout, baseRef } = runWith(options);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual(expect.stringMatching(plainSummary(baseRef)));
  });
});

describe('relayed tool output', () => {
  it('drops escape codes from finding messages and tool errors on the console and in reports', () => {
    const { stdout, reports, baseRef } = runWith({ analyzers: [fakeAnalyzer(), colouredCrash()] });
    const reportNames = ['report.txt', 'new-findings.json', 'tool-errors.json', 'report.sarif'];

    expect(stdout).toEqual(
      expect.stringMatching(exactText`Base: ${baseRef} (argument)

Quality gate summary
✖ 1 new enforceable violation
  fake-quality-analyzer/fixture-rule: Expected 1 to be 2
    src/main/flagged.ts:1:4
✖ 2 tool errors
  coloured-crash (base): coloured-crash crashed with exit 2: boom. ${linkSentence('analyzerCrashed')}
  coloured-crash (head): coloured-crash crashed with exit 2: boom. ${linkSentence('analyzerCrashed')}
Full diagnostics: ${OUTPUT_ROOT}/report.txt
`),
    );
    expect(
      reportNames.filter((name) => {
        const text = readFileSync(path.join(reports, name), 'utf8');
        return text.includes(ESCAPE) || text.includes(String.raw`\u001b`);
      }),
    ).toEqual([]);
  });
});

describe('diagnostics path', () => {
  it('prints the report path relative to the current folder when it is inside it', () => {
    const outputRoot = makeOutputRoot();
    const previous = process.cwd();
    process.chdir(path.dirname(outputRoot));
    try {
      const { stdout, baseRef } = runWith({ outputRoot });

      expect(stdout).toEqual(expect.stringMatching(plainSummary(baseRef, 'reports')));
    } finally {
      process.chdir(previous);
    }
  });
});
