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
