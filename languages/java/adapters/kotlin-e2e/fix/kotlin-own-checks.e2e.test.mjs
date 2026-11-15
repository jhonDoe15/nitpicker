import { describe, expect, it } from 'vitest';
import { useFixProject } from '../../../../../core/fix/test-support/fix-project.mjs';
import { KOTLIN_BUILDS } from '../../java-e2e/test-support/own-checks/own-check-kotlin-builds.mjs';
import {
  ALL_RULES,
  expectedOutcome,
  outcomeOf,
  ownCheckRepository,
} from '../../java-e2e/test-support/own-checks/own-check-projects.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const { fix } = useFixProject();

function fixWith(tool, cliArguments) {
  return fix({
    ...ownCheckRepository({ build: KOTLIN_BUILDS[tool], config: { preset: 'kotlin' } }),
    cliArguments: ['--fix', '--no-cache', ...cliArguments],
  });
}

describe.skipIf(!enabled).each(['gradle', 'maven'])(
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
