import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../adapters/java-diff.mjs';
import {
  isFormatting,
  MESSY,
  MESSY_SOURCE,
  ROOMY,
  ROOMY_SOURCE,
  summaryOf,
  withFourSpaces,
} from '../test-support/style-sources.mjs';
import {
  useMavenPresetProject,
  enabled,
  gradle,
  maven,
  twinProjects,
} from '../__tests__/maven-preset-project.mjs';

describe.skipIf(!enabled)('Java preset on Maven builds', () => {
  useMavenPresetProject();
  it('formats a 4-space project with --aosp and reports no layout, on Gradle and on Maven', () => {
    const [gradleProject, mavenProject] = twinProjects();
    for (const root of [gradleProject, mavenProject]) {
      withFourSpaces(root);
      writeFileSync(path.join(root, MESSY), MESSY_SOURCE);
    }
    const policy = { javaStyle: 'aosp' };
    const layout = ({ tool, rule }) =>
      tool === 'google-java-format' || (tool === 'checkstyle' && rule === 'Indentation');
    const messy = [`google-java-format format ${MESSY}`];

    expect(summaryOf(collectJavaFindings(gradleProject, { gradle, policy }), layout)).toEqual(
      messy,
    );
    expect(summaryOf(collectJavaFindings(mavenProject, { maven, policy }), layout)).toEqual(messy);
  }, 180_000);
  it('formats a palantir project with palantir-java-format and lets a 108-column line pass, on both builds', () => {
    const [gradleProject, mavenProject] = twinProjects();
    for (const root of [gradleProject, mavenProject]) {
      writeFileSync(path.join(root, MESSY), MESSY_SOURCE);
      writeFileSync(path.join(root, ROOMY), ROOMY_SOURCE);
    }
    const conventions = {
      'java.formatter': 'palantir',
      'java.indentation': '4',
      'java.lineLength': '120',
    };
    const policy = { javaStyle: 'palantir', conventions };
    const ours = ({ path: file, ...finding }) =>
      [MESSY, ROOMY].includes(file) && isFormatting(finding);

    expect(summaryOf(collectJavaFindings(gradleProject, { gradle, policy }), ours)).toEqual([
      `palantir-java-format format ${MESSY}`,
    ]);
    expect(summaryOf(collectJavaFindings(mavenProject, { maven, policy }), ours)).toEqual([
      `palantir-java-format format ${MESSY}`,
    ]);
  }, 180_000);
});
