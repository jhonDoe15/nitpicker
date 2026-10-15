import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cruiseStrict } from './fixtures/strict-cruise.mjs';
import { strictBoundaryRules, strictBoundaryRulesFor } from './strict-boundary-rules.mjs';

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
  ['domain-imports-id-library', 'domain-does-not-import-clock-or-id-libraries', 'as a parameter'],
  [
    'domain-reaches-io-through-shared',
    'domain-does-not-reach-io-through-shared',
    'Move that dependency out of the shared module',
  ],
  ['import-cycle', 'no-production-cycles', null],
];

const exceptionRoute = 'add an exception for this rule in nitpicker.config.json';

describe('strict boundary rules', () => {
  it('accepts the allowed layout', async () => {
    const result = await cruiseFixture('allowed');

    expect(result.exitCode, result.output).toBe(0);
  });

  it('accepts pure Node subpaths in domain/', async () => {
    const result = await cruiseFixture('domain-imports-pure-subpath');

    expect(result.exitCode, result.output).toBe(0);
  });

  it('names the exception route in every domain rule', () => {
    const domainRules = strictBoundaryRules.filter(({ name }) => name.startsWith('domain-'));

    expect(domainRules.length).toBeGreaterThan(5);
    for (const rule of domainRules) {
      expect(rule.comment, rule.name).toContain(exceptionRoute);
    }
  });

  it('lifts a rule for the importing files an exception names', () => {
    const rule = (exceptions) =>
      strictBoundaryRulesFor(exceptions).find(
        ({ name }) => name === 'domain-does-not-import-node-io',
      );

    expect(rule([]).from.pathNot).toBeUndefined();
    expect(
      rule([
        { rule: 'domain-does-not-import-node-io', paths: ['src/legacy/**'], reason: 'old' },
        { rule: 'other-rule', paths: ['src/other/**'], reason: 'unrelated' },
      ]).from.pathNot,
    ).toEqual(['^(?:src/legacy/.*)$']);
  });

  it('defines every strict rule the fixtures exercise', () => {
    const strictRules = violations.filter(([, , allowedForm]) => allowedForm !== null);

    expect(strictBoundaryRules.map(({ name }) => name)).toEqual(
      expect.arrayContaining(strictRules.map(([, rule]) => rule)),
    );
  });

  it.each(violations)('rejects %s', async (fixture, rule, allowedForm) => {
    const result = await cruiseFixture(fixture);
    const output = result.output.replaceAll(/\s+/g, ' ');

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain(rule);
    expect(output).toContain(allowedForm ?? '');
  });
});
