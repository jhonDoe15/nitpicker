import { describe } from 'vitest';
import { defineAllowedCases } from '../__tests__/kotlin-one-way-cases.mjs';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mjs';
import {
  initializeMavenProject,
  kotlinE2eEnabled,
  mavenDiffRunner,
} from './test-support/kotlin-maven-project.mjs';

const maven = process.env.NITPICKER_MAVEN;

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: one-way rules (allowed)', () => {
  const fixture = useKotlinOneWayProject('allowed', {
    initialize: initializeMavenProject,
    run: mavenDiffRunner(maven),
  });
  defineAllowedCases(fixture);
});
