import { describe } from 'vitest';
import { defineBannedCases } from '../../__tests__/kotlin-one-way-cases.mts';
import { useKotlinOneWayProject } from '../../__tests__/kotlin-one-way-project.mts';
import { runJavaDiff } from '../../__tests__/kotlin-e2e-project.mts';
import {
  initializeMavenProject,
  kotlinE2eEnabled,
  mavenDiffRunner,
} from '../__tests__/kotlin-maven-project.mts';

const maven = process.env['NITPICKER_MAVEN'];

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: one-way rules (banned)', () => {
  const fixture = useKotlinOneWayProject('banned', {
    initialize: initializeMavenProject,
    run: mavenDiffRunner(maven),
  });
  defineBannedCases(fixture, (project, policy) =>
    runJavaDiff({
      repositoryRoot: project.root,
      requestedBaseRef: 'main',
      gradle: undefined,
      maven,
      spawn: undefined,
      initScript: undefined,
      policy,
    }),
  );
});
