import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import {
  isFormatting,
  LOOSE,
  LOOSE_SOURCE,
  OPTED_IN_CHECKSTYLE,
  summaryOf,
  withFourSpaces,
} from '../test-support/style-sources.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../../adapters/test-support/gradle-e2e.mjs';
import {
  useMavenPresetProject,
  enabled,
  gradle,
  maven,
  twinProjects,
} from '../__tests__/maven-preset-project.mjs';

describe.skipIf(!enabled)('Java preset on Maven builds', () => {
  useMavenPresetProject();
  it(
    'with no formatter, flags the unused import only: 4-space indentation, no format finding, a one-letter field',
    () => {
      const [gradleProject, mavenProject] = twinProjects();
      for (const root of [gradleProject, mavenProject]) {
        withFourSpaces(root);
        writeFileSync(path.join(root, LOOSE), LOOSE_SOURCE);
      }
      const conventions = { 'java.formatter': 'none', 'java.indentation': '4' };
      const policy = { javaStyle: 'none', conventions };
      const unused = [`checkstyle UnusedImports ${LOOSE}`];

      expect(
        summaryOf(collectJavaFindings(gradleProject, { gradle, policy }), isFormatting),
      ).toEqual(unused);
      expect(summaryOf(collectJavaFindings(mavenProject, { maven, policy }), isFormatting)).toEqual(
        unused,
      );
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );
  it(
    'with no formatter and the project Checkstyle config in charge, still carries UnusedImports',
    () => {
      const [gradleProject, mavenProject] = twinProjects();
      for (const root of [gradleProject, mavenProject]) {
        withFourSpaces(root);
        writeFileSync(path.join(root, LOOSE), LOOSE_SOURCE);
        mkdirSync(path.join(root, 'config/checkstyle'), { recursive: true });
        writeFileSync(path.join(root, 'config/checkstyle/checkstyle.xml'), OPTED_IN_CHECKSTYLE);
      }
      const conventions = { 'java.formatter': 'none', 'java.indentation': '4' };
      const policyOf = (policyRoot) => ({
        javaStyle: 'none',
        conventions,
        toolPrecedence: { checkstyle: ['project'] },
        policyRoot,
      });
      const unused = [`checkstyle UnusedImports ${LOOSE}`];

      expect(
        summaryOf(
          collectJavaFindings(gradleProject, { gradle, policy: policyOf(gradleProject) }),
          isFormatting,
        ),
      ).toEqual(unused);
      expect(
        summaryOf(
          collectJavaFindings(mavenProject, { maven, policy: policyOf(mavenProject) }),
          isFormatting,
        ),
      ).toEqual(unused);
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );
});
