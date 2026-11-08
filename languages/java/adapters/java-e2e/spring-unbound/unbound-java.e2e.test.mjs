import { afterAll, describe, expect, it } from 'vitest';
import { removeUnboundProjects, UNBOUND_FINDINGS, unboundFindings } from './unbound-project.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;

describe.skipIf(!enabled)('Unbound Spring property keys with the Java preset', () => {
  afterAll(removeUnboundProjects);

  it('reports the same keys on Gradle, with the Boot metadata from the classpath', () => {
    expect(unboundFindings('gradle', { gradle, policy: {} })).toEqual(UNBOUND_FINDINGS);
  }, 180_000);

  it('reports the same keys on Maven', () => {
    expect(unboundFindings('maven', { maven, policy: {} })).toEqual(UNBOUND_FINDINGS);
  }, 180_000);
});
