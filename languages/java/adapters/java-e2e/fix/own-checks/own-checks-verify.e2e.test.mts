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
  type OwnCheckCase,
} from '../../test-support/own-checks/own-check-projects.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const { fix } = useFixProject();
const FIXED = fixedRuleFiles(PERFORMANCE_CASES);
const REPOSITORY_AND_SPOTBUGS = new Set([
  'SpringDataNoSaveInLoop',
  'SpringDataBatchOfOne',
  'EntityLoadedForExistence',
  'DMI_RANDOM_USED_ONLY_ONCE',
  'IIL_PREPARE_STATEMENT_IN_LOOP',
]);
const GROUPS: readonly (readonly [string, readonly OwnCheckCase[]])[] = [
  [
    'the repository and SpotBugs fixes',
    PERFORMANCE_CASES.filter(({ check }) => REPOSITORY_AND_SPOTBUGS.has(check)),
  ],
  [
    'the other PMD fixes',
    PERFORMANCE_CASES.filter(({ check }) => !REPOSITORY_AND_SPOTBUGS.has(check)),
  ],
];
const RUNS = (['gradle', 'maven'] as const).flatMap((tool) =>
  GROUPS.map(([name, cases]) => [tool, name, cases] as const),
);
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

describe.skipIf(!enabled).each(RUNS)(
  'nitpicker --fix with %s and %s named, then the real gate',
  (tool, _name, cases) => {
    it('keeps the declined files, verifies the fixed ones and drops the finding of each fixed rule', () => {
      const result = fix({
        ...ownCheckRepository({ build: BUILDS[tool], config: { preset: 'java' }, cases }),
        cliArguments: ['--fix', '--no-cache', ...rulesOf(cases)],
        realAnalyzers: true,
      });

      expect(outcomeOf(result, cases), result.stdout + result.stderr).toEqual(
        expectedOutcome({ withReview: true, cases }),
      );
      expect(
        { toolErrors: result.toolErrors(), leftOver: leftOver(result.newFindings()) },
        result.stdout + result.stderr,
      ).toEqual({ toolErrors: [], leftOver: [] });
    });
  },
);
