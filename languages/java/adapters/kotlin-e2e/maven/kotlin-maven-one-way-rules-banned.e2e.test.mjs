import { describe } from 'vitest';
import { runJavaDiff } from '../../java-diff.mjs';
import { defineBannedCases } from '../__tests__/kotlin-one-way-cases.mjs';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mjs';
import {
  initializeMavenProject,
  kotlinE2eEnabled,
  mavenDiffRunner,
} from './test-support/kotlin-maven-project.mjs';

const maven = process.env.NITPICKER_MAVEN;

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: one-way rules (banned)', () => {
  const fixture = useKotlinOneWayProject('banned', {
    initialize: initializeMavenProject,
    run: mavenDiffRunner(maven),
  });
  defineBannedCases(fixture, (project, policy) =>
    runJavaDiff({ repositoryRoot: project.root, requestedBaseRef: 'main', maven, policy }),
  );
});
