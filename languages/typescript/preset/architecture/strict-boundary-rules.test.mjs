import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEPENDENCY_RULES } from '../../../../shared/exceptions/rule-tools.mjs';
import cruiserConfig from '../defaults/dependency-cruiser.config.mjs';
import { NO_IMPORT_OUTSIDE_ROOTS } from './outside-roots/outside-roots.mjs';
import { cruiseStrict } from './test-support/strict-cruise.mjs';
import {
  REACH_THROUGH_SHARED_RULE,
  sharedReachPath,
  strictBoundaryRules,
  strictBoundaryRulesFor,
} from './strict-boundary-rules.mjs';

const fixturesRoot = path.resolve(import.meta.dirname, 'fixtures/strict');

function cruiseFixture(name, outputType = 'err-long') {
  return cruiseStrict({
    baseDir: path.join(fixturesRoot, name),
    paths: ['src'],
    outputType,
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
  ['domain-imports-id-library', 'domain-does-not-import-id-libraries', 'as a parameter'],
  [
    'domain-reaches-io-through-shared',
    'domain-does-not-reach-io-through-shared',
    'Move that dependency out of the shared module',
  ],
  ['import-cycle', 'no-production-cycles', null],
];

const exceptionRoute = 'An exception fits only when it is deliberate';

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
    expect(domainRules.filter(({ comment }) => !comment.includes(exceptionRoute))).toEqual([]);
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
    expect([...new Set(strictBoundaryRules.map(({ name }) => name))].sort()).toEqual([
      'domain-does-not-import-adapters',
      'domain-does-not-import-id-libraries',
      'domain-does-not-import-module-state',
      'domain-does-not-import-network-or-database-clients',
      'domain-does-not-import-node-io',
      'domain-does-not-import-the-logger',
      'domain-does-not-reach-io-through-shared',
      'feature-internals-only-through-index',
      'features-do-not-import-composition-root',
      'features-do-not-import-other-feature-internals',
      'shared-does-not-import-features',
    ]);
  });

  it.each(violations)('rejects %s', async (fixture, rule, allowedForm) => {
    const result = await cruiseFixture(fixture);
    const output = result.output.replaceAll(/\s+/g, ' ');

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain(rule);
    expect(output).toContain(allowedForm ?? '');
  });
});

describe('npm package patterns in the domain rules', () => {
  const packageRules = [
    ['domain-does-not-import-network-or-database-clients', 'pg'],
    ['domain-does-not-import-the-logger', 'pino'],
    ['domain-does-not-import-id-libraries', 'uuid'],
    ['domain-does-not-reach-io-through-shared', 'pg'],
  ];

  function matches(ruleName, target) {
    const rule = strictBoundaryRules.find(({ name }) => name === ruleName);
    return [rule.to.path].flat().some((pattern) => new RegExp(pattern).test(target));
  }

  it.each(packageRules)('%s matches %s unresolved, installed and under pnpm', (ruleName, name) => {
    expect(
      [
        name,
        `node_modules/${name}/lib/index.js`,
        `node_modules/.pnpm/${name}@8.11.0/node_modules/${name}/lib/index.js`,
      ].map((target) => matches(ruleName, target)),
    ).toEqual([true, true, true]);
  });

  it.each(packageRules)('%s does not match a local folder named %s', (ruleName, name) => {
    expect(
      [`src/main/shared/${name}/frames.ts`, `src/${name}/x.ts`].map((target) =>
        matches(ruleName, target),
      ),
    ).toEqual([false, false]);
  });
});

describe('the shared module a domain file reaches I/O through', () => {
  async function reachPaths(name) {
    const report = JSON.parse((await cruiseFixture(name, 'json')).output);
    return report.summary.violations
      .filter((violation) => violation.rule.name === REACH_THROUGH_SHARED_RULE)
      .map((violation) => [violation.from, sharedReachPath(violation, report.modules)]);
  }

  it('names the shared module and the I/O module it reaches', async () => {
    expect(await reachPaths('domain-reaches-io-through-shared')).toEqual([
      ['src/main/features/auth/domain/login.ts', ['src/main/shared/clock.ts', 'fs']],
    ]);
  });

  it('reaches nothing through a type-only import, a direct import or another domain file', async () => {
    const paths = await reachPaths('domain-reaches-io-only-directly');

    expect(paths.map(([from]) => from).sort()).toEqual([
      'src/main/features/calc/domain/direct.ts',
      'src/main/features/calc/domain/typed.ts',
      'src/main/features/calc/domain/user.ts',
    ]);
    expect(paths.map(([, via]) => via)).toEqual([undefined, undefined, undefined]);
  });
});

describe('the exception route of the dependency rules', () => {
  it('knows every dependency-cruiser rule except the one a layout setting lifts', () => {
    const names = cruiserConfig.forbidden.map(({ name }) => name);

    expect(names.filter((name) => name !== NO_IMPORT_OUTSIDE_ROOTS).toSorted()).toEqual(
      DEPENDENCY_RULES.toSorted(),
    );
  });
});
