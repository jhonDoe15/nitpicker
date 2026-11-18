import { describe, expect, it } from 'vitest';
import { useFixProject } from './test-support/kotlin-fix-views.mts';
import type { FixResult } from './test-support/kotlin-fix-views.mts';
import { KOTLIN_BUILDS } from '../../java-e2e/test-support/own-checks/own-check-kotlin-builds.mts';
import {
  ALL_RULES as untypedAllRules,
  expectedOutcome as untypedExpectedOutcome,
  outcomeOf as untypedOutcomeOf,
  ownCheckRepository as untypedOwnCheckRepository,
} from '../../java-e2e/test-support/own-checks/own-check-projects.mts';

type BuildTool = 'gradle' | 'maven';
type OwnCheckRepository = {
  readonly committed: Readonly<Record<string, string>>;
  readonly changed: Readonly<Record<string, string>>;
};

const ALL_RULES: string[] = untypedAllRules;
const expectedOutcome: (options: { withReview: boolean }) => unknown = untypedExpectedOutcome;
const outcomeOf: (result: FixResult) => unknown = untypedOutcomeOf;
const ownCheckRepository: (options: {
  build: Readonly<Record<string, string>>;
  config: Readonly<Record<string, unknown>>;
}) => OwnCheckRepository = untypedOwnCheckRepository;

const enabled = process.env['NITPICKER_KOTLIN_E2E'] === '1';
const { fix } = useFixProject();

function fixWith(tool: BuildTool, cliArguments: string[]): FixResult {
  return fix({
    ...ownCheckRepository({ build: KOTLIN_BUILDS[tool], config: { preset: 'kotlin' } }),
    cliArguments: ['--fix', '--no-cache', ...cliArguments],
  });
}

describe.skipIf(!enabled).each<BuildTool>(['gradle', 'maven'])(
  'nitpicker --fix on the Java sources of a Kotlin %s project',
  (tool) => {
    it('applies the safe checks and leaves the review checks alone', () => {
      const result = fixWith(tool, []);

      expect(outcomeOf(result), result.stdout + result.stderr).toEqual(
        expectedOutcome({ withReview: false }),
      );
      expect(result.toolErrors()).toEqual([]);
    });
    it('applies every fix-only check once its rule is named', () => {
      const result = fixWith(tool, ALL_RULES);

      expect(outcomeOf(result), result.stdout + result.stderr).toEqual(
        expectedOutcome({ withReview: true }),
      );
      expect(result.toolErrors()).toEqual([]);
    });
  },
);
