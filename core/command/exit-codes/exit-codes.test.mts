import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import {
  exactText,
  maskedDiagnostics,
} from '../../diff/reporting/test-support/output-expectations.mts';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { commit } from '../../diff/git/test-support/git-repository.mts';
import { crashingAnalyzer, fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mts';
import { linkSentence } from '../test-support/report-readers.mts';
import type { FixtureRepository } from '../test-support/fixture-types.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);
const CRASH = `crashing-analyzer crashed with exit 2: no diagnostic output. ${linkSentence('analyzerCrashed')}`;

describe('nitpicker CLI', () => {
  describe.each([
    ['comparison', (repository: FixtureRepository) => ['--base', repository.baseRef]],
    ['--all', () => ['--all']],
  ] as const)('exit code in %s mode', (mode, modeArguments) => {
    const run = ({
      withFinding,
      withToolError,
    }: {
      readonly withFinding: boolean;
      readonly withToolError: boolean;
    }) => {
      const repository = createRepository({
        'quality-policy.json': policy(),
        'src/main/clean.ts': 'export const clean = true;\n',
      });
      writeFiles(repository.root, { 'src/main/edited.ts': 'export const edited = true;\n' });
      if (withFinding) {
        writeFiles(repository.root, {
          'src/main/new.ts': findingLine(finding({ identity: 'new-finding' })),
        });
        if (mode === 'comparison') {
          commit(repository.root, 'add finding');
        }
      }
      const output = captureOutput();
      const analyzers = [fakeAnalyzer(), ...(withToolError ? [crashingAnalyzer()] : [])];
      const exitCode = runCli({
        arguments_: [...modeArguments(repository), '--output', makeOutputRoot()],
        environment: {},
        currentProjectRoot: repository.root,
        analyzers,
        snapshotAnalyzers: analyzers,
        stdout: output.stdout,
        stderr: output.stderr,
        runTasks: undefined,
      });
      return { exitCode, output };
    };
    const expectedModeOutput: unknown =
      mode === '--all'
        ? [
            '',
            'Quality snapshot summary',
            '✖ 1 enforceable finding',
            '  fake-quality-analyzer/fixture-rule: Fixture finding',
            '    src/main/new.ts:1:4',
            '✖ 1 tool error',
            `  crashing-analyzer (head): ${CRASH}`,
            'By analyzer:',
            '  fake-quality-analyzer: 1 enforceable, 0 descriptive',
            '  1 analyzer ran clean',
            'Full diagnostics: <path>',
            '',
          ].join('\n')
        : expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  fake-quality-analyzer/fixture-rule: Fixture finding
    src/main/new.ts:1:4
✖ 2 tool errors (1 distinct)
  crashing-analyzer (base and head): ${CRASH}
Full diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt
`);
    it('exits 1 for findings plus a tool error and still lists the error', () => {
      const { exitCode, output } = run({ withFinding: true, withToolError: true });
      expect(exitCode).toBe(1);
      expect(mode === '--all' ? maskedDiagnostics(output.stdoutText) : output.stdoutText).toEqual(
        expectedModeOutput,
      );
    });
    it.each([
      ['exits 2 for a tool error without findings', false, true, 2],
      ['exits 1 for findings without a tool error', true, false, 1],
      ['exits 0 when clean', false, false, 0],
    ] as const)('%s', (_name, withFinding, withToolError, expected) => {
      expect(run({ withFinding, withToolError }).exitCode).toBe(expected);
    });
  });
});
