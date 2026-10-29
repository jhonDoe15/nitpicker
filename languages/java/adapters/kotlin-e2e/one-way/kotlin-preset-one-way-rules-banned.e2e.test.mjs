import { describe } from 'vitest';
import { runJavaDiff } from '../../java-diff.mjs';
import { gradle, kotlinE2eEnabled } from '../test-support/kotlin-e2e-project.mjs';
import { defineBannedCases } from '../__tests__/kotlin-one-way-cases.mjs';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-way rules end to end', () => {
  const fixture = useKotlinOneWayProject('banned');
  defineBannedCases(fixture, (project, policy) =>
    runJavaDiff({ repositoryRoot: project.root, requestedBaseRef: 'main', gradle, policy }),
  );
});
