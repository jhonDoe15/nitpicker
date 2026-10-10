import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cruiseStrict } from './fixtures/strict-cruise.mjs';

const fixturesRoot = path.resolve(import.meta.dirname, 'fixtures/strict');

function cruiseFixture(name) {
  return cruiseStrict({
    baseDir: path.join(fixturesRoot, name),
    paths: ['src'],
    outputType: 'err-long',
  });
}

// Each violation: fixture directory, the rule that must fire, and the allowed form its message names.
const violations = [
  [
    'internal-import-from-feature',
    'features-do-not-import-other-feature-internals',
    'public index.ts',
  ],
  ['internal-import-from-shared', 'feature-internals-only-through-index', 'public index.ts'],
  [
    'shared-imports-feature',
    'shared-does-not-import-features',
    'parameter from the composition root',
  ],
  ['feature-imports-composition-root', 'features-do-not-import-composition-root', 'as a parameter'],
  ['domain-imports-adapters', 'domain-does-not-import-adapters', 'adapters/ implement it'],
  ['domain-imports-node-io', 'domain-does-not-import-node-io', 'only pure Node modules'],
  ['domain-imports-client', 'domain-does-not-import-network-or-database-clients', 'from adapters/'],
  ['domain-imports-logger', 'domain-does-not-import-the-logger', 'adapters/ log it'],
  [
    'domain-imports-state',
    'domain-does-not-import-module-state',
    'Receive the state as a parameter',
  ],
  ['import-cycle', 'no-production-cycles', null],
];

describe('strict boundary rules', () => {
  it('accepts the allowed layout', async () => {
    const result = await cruiseFixture('allowed');

    expect(result.exitCode, result.output).toBe(0);
  });

  it.each(violations)('rejects %s', async (fixture, rule, allowedForm) => {
    const result = await cruiseFixture(fixture);
    const output = result.output.replaceAll(/\s+/g, ' ');

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain(rule);
    if (allowedForm !== null) expect(output).toContain(allowedForm);
  });
});
