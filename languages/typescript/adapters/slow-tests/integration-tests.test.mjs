import { describe, expect, it } from 'vitest';
import { defaultResolvedLayout } from '../../preset/layout.mjs';
import { isIntegrationTest } from './integration-tests.mjs';

describe('integration tests by path', () => {
  it('tells the e2e root, integration folders and integration file suffixes from unit tests', () => {
    const files = [
      'e2e/login.test.ts',
      'test/integration/db.test.ts',
      'tests/api/__integration__/users.test.ts',
      '__tests__/system/clock.test.ts',
      'tests/end-to-end/flow.spec.js',
      'src/orders.integration.test.ts',
      'src/orders.e2e.spec.tsx',
      'src/orders.it.test.mjs',
      'src/orders.test.ts',
      'test/unit/orders.test.ts',
      'src/integrationless.test.ts',
      'src/integrations/stripe.test.ts',
      'src/system/clock.test.ts',
      'src/api/__integration__/users.test.ts',
    ];
    expect(files.map((file) => isIntegrationTest(file, defaultResolvedLayout))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
