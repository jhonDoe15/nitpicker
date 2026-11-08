import { afterAll, describe, expect, it } from 'vitest';
import {
  removeUnboundProjects,
  UNBOUND_FINDINGS,
  unboundFindings,
} from '../../java-e2e/spring-unbound/unbound-project.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const policy = { preset: 'kotlin' };

describe.skipIf(!enabled)('Unbound Spring property keys with the Kotlin preset', () => {
  afterAll(removeUnboundProjects);

  it('reports the same keys on Gradle', () => {
    expect(unboundFindings('gradle', { gradle, policy })).toEqual(UNBOUND_FINDINGS);
  }, 180_000);

  it('reports the same keys on Maven', () => {
    expect(unboundFindings('maven', { maven, policy })).toEqual(UNBOUND_FINDINGS);
  }, 180_000);
});
