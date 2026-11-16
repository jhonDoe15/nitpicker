import { describe, expect, it } from 'vitest';
import { useFixProject } from '../../../../../../core/fix/test-support/fix-project.mts';
import {
  ALL_RULES,
  BUILDS,
  expectedOutcome,
  outcomeOf,
  ownCheckRepository,
} from '../../test-support/own-checks/own-check-projects.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const { fix } = useFixProject();

function fixWith(tool, cliArguments) {
  return fix({
    ...ownCheckRepository({ build: BUILDS[tool], config: { preset: 'java' } }),
    cliArguments: ['--fix', '--no-cache', ...cliArguments],
  });
}

describe.skipIf(!enabled).each(['gradle', 'maven'])(
  'nitpicker --fix with the fix-only Error Prone checks on a %s project',
  (tool) => {
    it('applies the safe checks and leaves the review checks alone', () => {
      const result = fixWith(tool, []);

      expect(outcomeOf(result), result.stdout + result.stderr).toEqual(
        expectedOutcome({ withReview: false }),
      );
      expect(result.toolErrors()).toEqual([]);
    });
    it('applies every check once its rule is named', () => {
      const result = fixWith(tool, ALL_RULES);

      expect(outcomeOf(result), result.stdout + result.stderr).toEqual(
        expectedOutcome({ withReview: true }),
      );
      expect(result.toolErrors()).toEqual([]);
    });
  },
);
