import { describe, expect, it } from 'vitest';
import { useFixProject } from '../../../../../../core/fix/test-support/fix-project.mts';
import { entriesOf } from '../../../../../../shared/values/findings.mts';
import { textOf } from '../../../../../../shared/values/readers.mts';
import {
  BUILDS,
  expectedOutcome,
  fixedRuleFiles,
  outcomeOf,
  ownCheckRepository,
  PERFORMANCE_CASES,
  rulesOf,
} from '../../test-support/own-checks/own-check-projects.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const { fix } = useFixProject();
const FIXED = fixedRuleFiles(PERFORMANCE_CASES);
const REWRITTEN = new Map(
  PERFORMANCE_CASES.map(({ file, before, after }) => {
    const kept = new Set(before.split('\n'));
    return [file, after.split('\n').map((line) => !kept.has(line))] as const;
  }),
);

function leftOver(findings: unknown): string[] {
  return entriesOf(findings)
    .map(({ tool, rule, path: file, line }) => ({
      key: `${textOf(tool)}/${textOf(rule)} ${textOf(file)}`,
      rewritten: REWRITTEN.get(textOf(file))?.[Number(line) - 1] === true,
      line: Number(line),
    }))
    .filter(({ key, rewritten }) => FIXED.has(key) && rewritten)
    .map(({ key, line }) => `${key}:${String(line)}`);
}

describe.skipIf(!enabled).each(['gradle', 'maven'] as const)(
  'nitpicker --fix with every performance fix named on a %s project, then the real gate',
  (tool) => {
    it('keeps the declined files, verifies the fixed ones and drops the finding of each fixed rule', () => {
      const result = fix({
        ...ownCheckRepository({
          build: BUILDS[tool],
          config: { preset: 'java' },
          cases: PERFORMANCE_CASES,
        }),
        cliArguments: ['--fix', '--no-cache', ...rulesOf(PERFORMANCE_CASES)],
        realAnalyzers: true,
      });

      expect(outcomeOf(result, PERFORMANCE_CASES), result.stdout + result.stderr).toEqual(
        expectedOutcome({ withReview: true, cases: PERFORMANCE_CASES }),
      );
      expect(
        { toolErrors: result.toolErrors(), leftOver: leftOver(result.newFindings()) },
        result.stdout + result.stderr,
      ).toEqual({ toolErrors: [], leftOver: [] });
    });
  },
);
