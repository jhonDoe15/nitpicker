import { afterEach, describe, expect, it } from 'vitest';
import { kotlinProjects } from '../adapters/kotlin/test-support/kotlin-project.mjs';
import { kotlinStyle } from './kotlin-style.mjs';

const projects = kotlinProjects();

afterEach(projects.remove);

describe('the Kotlin style summary', () => {
  it('names the problem when the settings cannot be read', () => {
    const projectRoot = projects.project({ 'build.gradle.kts': '' });
    const config = {
      kotlin: { formatter: 'ktlint', detektConfig: 'config/detekt.yml' },
      tools: { detekt: { precedence: ['nitpicker'] } },
    };

    expect(kotlinStyle({ config, projectRoot }).summary({})).toEqual([
      'Could not read the Kotlin style settings: "kotlin.detektConfig" is config/detekt.yml, which does not exist: create it, or change or remove "kotlin.detektConfig"',
    ]);
  });
});

describe('the Kotlin style of a Maven build', () => {
  const headPolicy = { kotlin: { formatter: 'ktfmt', build: 'maven', ktfmtStyle: 'google' } };
  const config = { tools: { ktfmt: { precedence: ['project', 'nitpicker'] } } };

  it('follows the facts of the head policy for the base and the head alike', () => {
    const projectRoot = projects.project({ 'pom.xml': '<project/>' });
    const source = { readMany: () => new Map(), paths: () => [] };
    const style = kotlinStyle({ config, projectRoot, source, headPolicy });

    expect(style.unused).toEqual({ 'kotlin.trailingCommas': 'ktfmt always adds trailing commas' });
    expect(style.project).toEqual({
      'kotlin.indentation': { choice: '2', from: 'your build file' },
    });
  });

  it('reads the formatter of the head policy, not the one named in the base files', () => {
    const projectRoot = projects.project({ 'pom.xml': '<project/>' });
    const source = {
      readMany: () =>
        new Map([['build.gradle.kts', 'plugins { id("org.jlleitschuh.gradle.ktlint") }']]),
      paths: () => [],
    };
    const none = { kotlin: { formatter: 'none', build: 'maven' } };

    expect(
      Object.keys(kotlinStyle({ config, projectRoot, source, headPolicy: none }).unused),
    ).toEqual(['kotlin.trailingCommas', 'kotlin.indentation', 'kotlin.lineLength']);
  });
});
