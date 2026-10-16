import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../../adapters/test-support/gradle-e2e.mjs';
import { codeSmellRules } from '../../adapters/test-support/code-smell-rules.mjs';
import {
  expectedViolations,
  reportedViolations,
} from '../../adapters/test-support/violation-markers.mjs';
import { copyOf, removeCopies, withoutGradle } from '../test-support/maven-e2e-projects.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const maven = process.env.NITPICKER_MAVEN;
const fixtures = path.join(import.meta.dirname, '..', 'fixtures');
const gradleFixtures = path.join(import.meta.dirname, '../../adapters/fixtures');

afterAll(removeCopies);

describe.skipIf(!enabled)('Java code smell rules on Maven builds', () => {
  it(
    'reports exactly the code smell violations marked in main and test sources',
    () => {
      const project = withoutGradle(
        copyOf(
          path.join(gradleFixtures, 'code-smells-project'),
          path.join(fixtures, 'code-smells'),
        ),
      );
      collectJavaFindings(project, { maven, policy: {} });
      const checked = new Set([
        ...codeSmellRules().map(({ name }) => name),
        'AvoidDuplicateLiterals',
      ]);
      const sarif = path.join(project, 'target/nitpicker/pmd.sarif');

      expect(
        ['main', 'test'].map((sourceSet) => {
          const sourceRoot = path.join(project, 'src', sourceSet, 'java');
          return reportedViolations(sarif, sourceRoot, (rule) => checked.has(rule));
        }),
      ).toEqual(
        ['main', 'test'].map((sourceSet) =>
          expectedViolations(path.join(project, 'src', sourceSet, 'java')),
        ),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
