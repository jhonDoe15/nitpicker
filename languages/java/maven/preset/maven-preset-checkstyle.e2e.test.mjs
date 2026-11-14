import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import { byText } from '../../../../shared/text-order/by-text.mjs';
import {
  isFormatting,
  LOOSE,
  LOOSE_SOURCE,
  OPTED_IN_CHECKSTYLE,
  summaryOf,
  TABBED,
  TABBED_SOURCE,
  withFourSpaces,
} from '../test-support/style-sources.mjs';
import {
  useMavenPresetProject,
  enabled,
  gradle,
  maven,
  twinProjects,
} from '../__tests__/maven-preset-project.mts';

describe.skipIf(!enabled)('Java preset on Maven builds', () => {
  useMavenPresetProject();
  it('with no formatter, flags the unused import only: 4-space indentation, no format finding, a one-letter field', () => {
    const [gradleProject, mavenProject] = twinProjects();
    for (const root of [gradleProject, mavenProject]) {
      withFourSpaces(root);
      writeFileSync(path.join(root, LOOSE), LOOSE_SOURCE);
    }
    const conventions = { 'java.formatter': 'none', 'java.indentation': '4' };
    const policy = { javaStyle: 'none', conventions };
    const unused = [`checkstyle UnusedImports ${LOOSE}`];

    expect(summaryOf(collectJavaFindings(gradleProject, { gradle, policy }), isFormatting)).toEqual(
      unused,
    );
    expect(summaryOf(collectJavaFindings(mavenProject, { maven, policy }), isFormatting)).toEqual(
      unused,
    );
  }, 180_000);
  it('with no formatter and the project Checkstyle config in charge, still carries UnusedImports', () => {
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
  }, 180_000);
  it('with no formatter, reports a tab-indented line under FileTabCharacter only, on both builds', () => {
    const [gradleProject, mavenProject] = twinProjects();
    for (const root of [gradleProject, mavenProject]) {
      withFourSpaces(root);
      writeFileSync(path.join(root, TABBED), TABBED_SOURCE);
    }
    const conventions = { 'java.formatter': 'none', 'java.indentation': '4' };
    const policy = { javaStyle: 'none', conventions };
    const layout = ({ tool, rule, path: file }) =>
      file === TABBED &&
      tool === 'checkstyle' &&
      ['FileTabCharacter', 'Indentation'].includes(rule);
    const both = [`checkstyle FileTabCharacter ${TABBED}`, `checkstyle Indentation ${TABBED}`];
    const once = [`checkstyle FileTabCharacter ${TABBED}`];
    const reported = (findings) => findings;

    expect(
      summaryOf(
        collectJavaFindings(gradleProject, { gradle, policy, resolveOverlaps: reported }),
        layout,
      ).toSorted(byText),
    ).toEqual(both);
    expect(summaryOf(collectJavaFindings(gradleProject, { gradle, policy }), layout)).toEqual(once);
    expect(summaryOf(collectJavaFindings(mavenProject, { maven, policy }), layout)).toEqual(once);
  }, 180_000);
});
