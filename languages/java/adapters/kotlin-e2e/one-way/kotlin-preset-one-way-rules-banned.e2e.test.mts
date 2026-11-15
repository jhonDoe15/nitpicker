import { describe } from 'vitest';
import { gradle, kotlinE2eEnabled, runJavaDiff } from '../__tests__/kotlin-e2e-project.mts';
import { defineBannedCases } from '../__tests__/kotlin-one-way-cases.mts';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-way rules end to end', () => {
  const fixture = useKotlinOneWayProject('banned');
  defineBannedCases(fixture, (project, policy) =>
    runJavaDiff({
      repositoryRoot: project.root,
      requestedBaseRef: 'main',
      gradle,
      maven: undefined,
      spawn: undefined,
      initScript: undefined,
      policy,
    }),
  );
});
