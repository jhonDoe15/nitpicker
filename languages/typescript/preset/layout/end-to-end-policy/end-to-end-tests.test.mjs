import { describe, expect, it } from 'vitest';
import { isIntegrationTestFor } from '../end-to-end-tests.mjs';

describe('integration tests by policy', () => {
  it('classifies a project-relative file with the layout of the policy', () => {
    const policy = { layout: { testRoots: ['spec'] } };

    expect(isIntegrationTestFor('spec/e2e/flow.test.ts', policy)).toBe(true);
    expect(isIntegrationTestFor('src\\orders.e2e.test.ts', policy)).toBe(true);
    expect(isIntegrationTestFor('spec/orders.test.ts', policy)).toBe(false);
    expect(isIntegrationTestFor(undefined, policy)).toBe(false);
  });

  it('counts only e2e and integration names and folders, and the helpers below such a folder', () => {
    const policy = {};
    const counted = [
      'src/orders.integration.test.ts',
      'tools/java-e2e/__tests__/project.mjs',
      'tools/java-e2e/support/helper.mts',
      'tests/integration/db.test.ts',
    ];
    const notCounted = [
      'src/orders.it.test.mjs',
      'src/orders.int.test.mjs',
      'src/system/clock.test.ts',
      'src/functional/flow.test.ts',
      'src/__tests__/helper.mjs',
      'src/e2eish/flow.test.ts',
    ];

    expect(counted.map((file) => isIntegrationTestFor(file, policy))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(notCounted.map((file) => isIntegrationTestFor(file, policy))).toEqual(
      notCounted.map(() => false),
    );
  });
});
