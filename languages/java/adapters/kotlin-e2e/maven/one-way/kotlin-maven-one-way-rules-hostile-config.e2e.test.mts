import { describe } from 'vitest';
import { defineHostileConfigCases } from '../../__tests__/kotlin-one-way-cases.mts';
import { useKotlinOneWayProject } from '../../__tests__/kotlin-one-way-project.mts';
import {
  initializeMavenProject,
  kotlinE2eEnabled,
  mavenDiffRunner,
} from '../__tests__/kotlin-maven-project.mts';

const maven = process.env['NITPICKER_MAVEN'];

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: one-way rules (hostile-config)', () => {
  const fixture = useKotlinOneWayProject('hostile-config', {
    initialize: initializeMavenProject,
    run: mavenDiffRunner(maven),
  });
  defineHostileConfigCases(fixture, 'maven-failure');
});
