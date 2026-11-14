import { describe } from 'vitest';
import { defineAllowedCases } from '../../__tests__/kotlin-one-way-cases.mts';
import { useKotlinOneWayProject } from '../../__tests__/kotlin-one-way-project.mts';
import {
  initializeMavenProject,
  kotlinE2eEnabled,
  mavenDiffRunner,
} from '../__tests__/kotlin-maven-project.mts';

const maven = process.env['NITPICKER_MAVEN'];

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: one-way rules (allowed)', () => {
  const fixture = useKotlinOneWayProject('allowed', {
    initialize: initializeMavenProject,
    run: mavenDiffRunner(maven),
  });
  defineAllowedCases(fixture);
});
